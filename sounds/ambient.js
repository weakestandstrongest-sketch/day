// 環境音（ホワイトノイズ・雨・波・焚き火・風など）を、音のファイルを使わずにその場で作って流す。
// ひび手帳の集中タイマーと、しずく（マインドフルネス）の両方で使う。
//   HibiAmbient.play('rain', 0.6) / HibiAmbient.volume(0.4) / HibiAmbient.stop() / HibiAmbient.kind
(function () {
  const KINDS = [
    { id: 'rain', name: '雨' },
    { id: 'waves', name: '波' },
    { id: 'fire', name: '焚き火' },
    { id: 'wind', name: '森の風' },
    { id: 'stream', name: '小川' },
    { id: 'white', name: 'ホワイトノイズ' },
    { id: 'pink', name: 'ピンクノイズ' },
    { id: 'brown', name: 'ブラウンノイズ' },
  ];
  let ctx = null, master = null, nodes = [], timers = [], kind = null, vol = 0.6;
  const buffers = {};

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 4秒のノイズ（つなぎ目が目立たないよう、はじめと終わりを少し重ねる）
  function noise(type) {
    if (buffers[type]) return buffers[type];
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (type === 'white') d[i] = w * 0.5;
        else if (type === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      }
      const fade = Math.floor(ctx.sampleRate * 0.05);
      for (let i = 0; i < fade; i++) { const k = i / fade; d[i] = d[i] * k + d[len - fade + i] * (1 - k); }
    }
    return (buffers[type] = buf);
  }

  function src(type) {
    const s = ctx.createBufferSource();
    s.buffer = noise(type); s.loop = true;
    s.loopEnd = s.buffer.duration - 0.05;
    s.start(ctx.currentTime, Math.random() * 3);
    nodes.push(s);
    return s;
  }
  function filt(type, freq, q) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; nodes.push(f); return f; }
  function gain(v) { const g = ctx.createGain(); g.gain.value = v; nodes.push(g); return g; }
  function lfo(rate, depth, target, offset) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(target);
    if (offset != null) target.value = offset;
    o.start(); nodes.push(o, g);
  }
  function chain(...xs) { for (let i = 0; i < xs.length - 1; i++) xs[i].connect(xs[i + 1]); return xs[xs.length - 1]; }
  function every(fn, min, max) {
    const loop = () => { if (!kind) return; fn(); timers.push(setTimeout(loop, min + Math.random() * (max - min))); };
    timers.push(setTimeout(loop, min));
  }
  // 短い音のつぶ（雨のしずく・焚き火のはぜる音）
  function grain(freq, q, len, level, type) {
    const s = ctx.createBufferSource(); s.buffer = noise(type || 'white');
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(), t = ctx.currentTime, p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    if (p) { p.pan.value = Math.random() * 1.6 - 0.8; s.connect(f); f.connect(g); g.connect(p); p.connect(master); }
    else { s.connect(f); f.connect(g); g.connect(master); }
    s.start(t, Math.random() * 3); s.stop(t + len + 0.05);
  }

  const BUILD = {
    white() { chain(src('white'), gain(0.35), master); },
    pink() { chain(src('pink'), gain(0.7), master); },
    brown() { chain(src('brown'), gain(0.6), master); },
    rain() {
      chain(src('pink'), filt('highpass', 400), filt('lowpass', 7000), gain(0.55), master);
      const g = gain(0.25); chain(src('white'), filt('bandpass', 2600, 0.6), g, master);
      lfo(0.07, 0.08, g.gain, 0.25);
      every(() => grain(2500 + Math.random() * 3500, 3, 0.05 + Math.random() * 0.05, 0.12 + Math.random() * 0.12), 25, 110);
    },
    waves() {
      const g = gain(0.2); chain(src('brown'), filt('lowpass', 900), g, master);
      lfo(0.085, 0.45, g.gain, 0.5);
      const h = gain(0.05); chain(src('pink'), filt('bandpass', 1800, 0.5), h, master);
      lfo(0.085, 0.07, h.gain, 0.08);
    },
    fire() {
      chain(src('brown'), filt('lowpass', 600), gain(0.5), master);
      chain(src('pink'), filt('bandpass', 1200, 0.8), gain(0.06), master);
      every(() => grain(1500 + Math.random() * 3000, 8, 0.015 + Math.random() * 0.03, 0.3 + Math.random() * 0.4), 60, 420);
      every(() => { for (let i = 0; i < 4; i++) setTimeout(() => kind === 'fire' && grain(2200 + Math.random() * 2000, 10, 0.012, 0.25), i * (20 + Math.random() * 40)); }, 1500, 5000);
    },
    wind() {
      const f = filt('bandpass', 500, 1.2), g = gain(0.5);
      chain(src('pink'), f, g, master);
      lfo(0.06, 260, f.frequency, 520);
      lfo(0.11, 0.25, g.gain, 0.45);
      chain(src('brown'), filt('lowpass', 300), gain(0.25), master);
    },
    stream() {
      chain(src('pink'), filt('highpass', 300), filt('lowpass', 4500), gain(0.35), master);
      every(() => grain(800 + Math.random() * 1600, 14, 0.06 + Math.random() * 0.08, 0.08 + Math.random() * 0.1, 'pink'), 30, 140);
    },
  };

  function clear() {
    for (const t of timers) clearTimeout(t); timers = [];
    for (const n of nodes) { try { n.stop && n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }
    nodes = [];
  }

  function play(id, v) {
    if (!BUILD[id]) return;
    ac();
    if (v != null) vol = v;
    const t = ctx.currentTime;
    if (kind) {
      // 前の音を少しずつ小さくしてから入れかえる
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + 0.4);
      const next = id; kind = next;
      setTimeout(() => { if (kind !== next) return; clear(); BUILD[next](); fadeIn(); }, 420);
      return;
    }
    kind = id; clear(); BUILD[id](); fadeIn();
  }
  function fadeIn() {
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(vol, t + 1.5);
  }
  function stop(fade = 1.2) {
    if (!ctx || !kind) { kind = null; return; }
    const t = ctx.currentTime, was = kind;
    kind = null;
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => { if (!kind) clear(); }, fade * 1000 + 60);
    return was;
  }
  function volume(v) {
    vol = Math.max(0, Math.min(1, v));
    if (ctx && kind) { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(vol, t, 0.1); }
  }

  window.HibiAmbient = { kinds: KINDS, play, stop, volume, get kind() { return kind; }, get vol() { return vol; } };
})();
