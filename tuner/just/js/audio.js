/*
 * Chord Finder JI — グランドピアノ音源で和音を鳴らす。
 * Salamander Grand Piano V3（Alexander Holm, CC BY 3.0）のサンプルを playbackRate で
 * 目的の周波数へ正確に移調するので、平均律と純正律の差（セント）はそのまま音に反映される。
 * サンプルが読み込めない場合は倍音を含む合成音で代用する。
 */
(function (global) {
  'use strict';

  const SAMPLE_NAMES = [
    'A1', 'C2', 'Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4',
    'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6', 'Ds6', 'Fs6', 'A6', 'C7',
  ];
  const NAME_PC = { C: 0, Ds: 3, Fs: 6, A: 9 };
  const SAMPLE_A4 = 440; // サンプルの録音ピッチ
  const BASE_URL = 'audio/piano/';

  function sampleMidi(name) {
    const m = /^([A-Z]s?)(\d)$/.exec(name);
    return 12 * (Number(m[2]) + 1) + NAME_PC[m[1]];
  }

  let ctx = null;
  let dry = null;
  let wet = null;
  let wave = null;
  let loadPromise = null;
  const buffers = new Map(); // midi -> AudioBuffer
  const listeners = new Set();
  const status = { loaded: 0, total: SAMPLE_NAMES.length, done: false, failed: false };
  let voices = [];
  let timers = [];

  function emit() {
    for (const fn of listeners) fn(Object.assign({}, status));
  }

  function impulse(c, seconds, decay) {
    const rate = c.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = c.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const fadeIn = Math.min(1, i / (rate * 0.012));
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * fadeIn;
      }
    }
    return buf;
  }

  function context() {
    if (ctx) return ctx;
    // iOS Safari 16.4+: 消音スイッチがオンでも鳴らせるようにする
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* noop */ }
    const AC = global.AudioContext || global.webkitAudioContext;
    ctx = new AC();

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 10;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.3;
    const master = ctx.createGain();
    master.gain.value = 0.95;

    // 小さめのホール残響
    dry = ctx.createGain();
    dry.gain.value = 1;
    wet = ctx.createGain();
    wet.gain.value = 0.2;
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, 2.4, 3.2);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 4800;

    dry.connect(master);
    wet.connect(conv);
    conv.connect(tone);
    tone.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);

    const n = 12;
    const real = new Float32Array(n + 1);
    const imag = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) imag[k] = 1 / Math.pow(k, 1.4);
    wave = ctx.createPeriodicWave(real, imag);
    return ctx;
  }

  function decode(c, ab) {
    return new Promise((resolve, reject) => c.decodeAudioData(ab, resolve, reject));
  }

  /** ピアノのサンプルを読み込む（何度呼んでも1回だけ） */
  function load() {
    if (loadPromise) return loadPromise;
    const c = context();
    loadPromise = Promise.all(SAMPLE_NAMES.map((name) =>
      fetch(BASE_URL + name + '.mp3')
        .then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        })
        .then((ab) => decode(c, ab))
        .then((buf) => {
          buffers.set(sampleMidi(name), buf);
          status.loaded++;
          emit();
        })
        .catch(() => { /* そのサンプルは使わない */ }),
    )).then(() => {
      status.done = true;
      status.failed = buffers.size === 0;
      emit();
    });
    return loadPromise;
  }

  function nearestSample(midi) {
    let best = null;
    for (const k of buffers.keys()) if (best == null || Math.abs(k - midi) < Math.abs(best - midi)) best = k;
    return best;
  }

  function strikePiano(freq, start, dur, level) {
    const midi = 69 + 12 * Math.log2(freq / SAMPLE_A4);
    const key = nearestSample(midi);
    const src = ctx.createBufferSource();
    src.buffer = buffers.get(key);
    src.playbackRate.value = freq / (SAMPLE_A4 * Math.pow(2, (key - 69) / 12));
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, start);
    g.gain.setTargetAtTime(0, start + dur, 0.09); // ダンパーで止める
    src.connect(g);
    g.connect(dry);
    g.connect(wet);
    src.start(start);
    src.stop(start + dur + 0.8);
    voices.push({ src, g });
  }

  function strikeSynth(freq, start, dur, level) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.setPeriodicWave(wave);
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(level * 0.5, start + 0.02);
    g.gain.setTargetAtTime(level * 0.25, start + 0.05, 0.6);
    g.gain.setTargetAtTime(0, start + dur, 0.08);
    o.connect(g);
    g.connect(dry);
    g.connect(wet);
    o.start(start);
    o.stop(start + dur + 0.6);
    voices.push({ src: o, g });
  }

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const v of voices) {
      try {
        v.g.gain.cancelScheduledValues(t);
        v.g.gain.setTargetAtTime(0, t, 0.03);
        v.src.stop(t + 0.25);
      } catch (e) { /* already stopped */ }
    }
    voices = [];
  }

  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

  /**
   * steps: [{ freqs, dur, label }] を順番に鳴らす。onStep(label|null) で進行を通知。
   */
  async function playSequence(steps, onStep) {
    const c = context();
    if (c.state === 'suspended') c.resume();
    stop();
    if (!status.done) {
      onStep && onStep('loading');
      await withTimeout(load(), 12000);
    }
    const piano = buffers.size > 0;
    let t = c.currentTime + 0.06;
    let delay = 60;
    for (const s of steps) {
      const level = 0.75 / Math.sqrt(s.freqs.length);
      for (const f of s.freqs) (piano ? strikePiano : strikeSynth)(f, t, s.dur, level);
      const label = s.label;
      timers.push(setTimeout(() => onStep && onStep(label), delay));
      t += s.dur + 0.25;
      delay += (s.dur + 0.25) * 1000;
    }
    timers.push(setTimeout(() => onStep && onStep(null), delay + 300));
  }

  function onStatus(fn) {
    listeners.add(fn);
    fn(Object.assign({}, status));
  }

  global.ChordAudio = { load, playSequence, stop, onStatus, SAMPLE_NAMES, BASE_URL };
})(window);
