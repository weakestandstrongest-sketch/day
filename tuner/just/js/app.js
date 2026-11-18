/* Chord Finder JI — UI */
(function () {
  'use strict';

  const E = window.ChordEngine;
  const A = window.ChordAudio;
  const $ = (id) => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const SETTINGS_KEY = 'chord-finder-ji:settings:v2';
  const WHITE_W = 35;
  const KEY_LOW = 36; // C2
  const KEY_HIGH = 84; // C6
  const BLACK = new Set([1, 3, 6, 8, 10]);
  const EXAMPLES = ['ドミソ', 'レファラド', 'ソシレファ', 'C E G B♭ D'];

  const RATIO_NAMES = {
    '1/1': 'ユニゾン（ルート）',
    '16/15': '純正短2度', '256/243': 'ピタゴラス短2度（リンマ）', '17/16': '第17倍音',
    '9/8': '大全音', '10/9': '小全音',
    '6/5': '純正短3度', '7/6': 'セプティマル短3度', '32/27': 'ピタゴラス短3度',
    '75/64': '純正増2度', '19683/16384': 'ピタゴラス増2度',
    '5/4': '純正長3度（第5倍音）', '81/64': 'ピタゴラス長3度', '9/7': 'セプティマル長3度',
    '4/3': '純正完全4度', '11/8': '第11倍音',
    '45/32': '純正増4度', '729/512': 'ピタゴラス増4度',
    '64/45': '純正減5度', '7/5': 'セプティマル減5度', '1024/729': 'ピタゴラス減5度',
    '3/2': '純正完全5度（第3倍音）',
    '25/16': '純正増5度', '6561/4096': 'ピタゴラス増5度',
    '8/5': '純正短6度', '128/81': 'ピタゴラス短6度',
    '5/3': '純正長6度', '27/16': 'ピタゴラス長6度', '12/7': 'セプティマル長6度',
    '128/75': '純正減7度', '32768/19683': 'ピタゴラス減7度',
    '9/5': '純正短7度（大）', '16/9': '純正短7度（小）＝ピタゴラス短7度', '7/4': '自然7度（第7倍音）',
    '15/8': '純正長7度', '243/128': 'ピタゴラス長7度',
  };
  const LIMIT_NAMES = { 1: '', 3: '3リミット', 5: '5リミット', 7: '7リミット', 11: '11リミット', 17: '17リミット' };

  const state = {
    input: '',
    mode: 'just5',
    ref: 'root',
    tonic: 0,
    a4: 442,
    spelling: 'flat',
    selected: 0,
    overrides: {},
    analysis: null,
    tuning: null,
    piano: { loaded: 0, total: 0, done: false, failed: false },
    playing: null,
    playingButton: null,
  };

  /* ---------------------------------------------------------- helpers */

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (s.mode in E.MODES) state.mode = s.mode;
      if (['root', 'bass', 'key'].includes(s.ref)) state.ref = s.ref;
      if (Number.isInteger(s.tonic) && s.tonic >= 0 && s.tonic < 12) state.tonic = s.tonic;
      if (s.a4 >= 400 && s.a4 <= 480) state.a4 = s.a4;
      if (s.spelling === 'sharp' || s.spelling === 'flat') state.spelling = s.spelling;
    } catch (e) { /* storage unavailable */ }
  }

  function saveSettings() {
    try {
      const { mode, ref, tonic, a4, spelling } = state;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, ref, tonic, a4, spelling }));
    } catch (e) { /* storage unavailable */ }
  }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v != null && v !== false) node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null) node.append(c);
    return node;
  }

  function svg(tag, attrs, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    for (const c of children) node.append(c);
    return node;
  }

  function fmtCents(x) {
    const r = Math.round(x * 10) / 10;
    if (r === 0) return '0.0';
    return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(1);
  }
  const centsClass = (x) => (Math.abs(x) < 0.05 ? 'zero' : x < 0 ? 'neg' : 'pos');
  const degLabel = (d) => (d === '1' ? 'R' : d);
  const fmtA4 = (v) => String(Math.round(v * 10) / 10);

  function tuneOpts(withOverrides) {
    return {
      mode: state.mode, ref: state.ref, tonic: state.tonic, a4: state.a4,
      overrides: withOverrides ? state.overrides : {},
    };
  }

  /* ---------------------------------------------------------- analyze */

  function compute() {
    state.analysis = E.analyze(state.input);
    state.selected = 0;
    state.overrides = {};
    try {
      const url = state.input.trim() ? '#q=' + encodeURIComponent(state.input) : location.pathname + location.search;
      history.replaceState(null, '', url);
    } catch (e) { /* sandboxed */ }
    render();
  }

  function setInput(text) {
    state.input = text;
    $('notes-input').value = text;
    compute();
  }

  function render() {
    renderChips();
    renderStage();
    renderCandidates();
    renderTuning();
    renderKeyboard();
  }

  /** 選択中の解釈を変えずに、チューニング関連だけ描き直す */
  function renderTuningViews() {
    renderStage();
    renderTuning();
    renderKeyboard();
  }

  function renderChips() {
    const box = $('chips');
    box.replaceChildren();
    const a = state.analysis;
    if (!a) return;
    for (const n of a.notes) box.append(el('span', { class: 'chip' }, n.name + n.octave, el('small', {}, n.solfege)));
    if (a.unknown.length) {
      box.append(el('span', { class: 'chip error' }, '読み取れない文字：' + [...new Set(a.unknown)].join(' ')));
    }
  }

  /* ------------------------------------------------------------ stage */

  function renderStage() {
    const a = state.analysis;
    const has = a && a.notes.length;
    const label = $('stage-label');
    const name = $('chord-name');
    const ratio = $('ratio-line');
    const examples = $('examples');
    $('gauge-wrap').hidden = !has;
    $('play-row').hidden = !has;
    $('play-status').hidden = !has;
    examples.hidden = !!has;
    ratio.replaceChildren();

    if (!has) {
      state.tuning = null;
      label.textContent = '構成音を入力すると、ここにコード名と純正律のずれが表示されます';
      name.className = 'chord-name empty';
      name.textContent = '例をタップして試す';
      examples.replaceChildren(...EXAMPLES.map((q) => el('button', { onclick: () => setInput(q) }, q)));
      return;
    }

    const cand = a.candidates[state.selected] || null;
    state.tuning = E.tune(a.notes, cand, tuneOpts(true));
    const t = state.tuning;
    const pcs = new Set(a.notes.map((n) => n.pc));

    label.textContent = '「' + state.input.trim() + '」のコード名';
    if (cand) {
      name.className = 'chord-name';
      name.textContent = cand.name;
    } else {
      name.className = 'chord-name empty';
      name.textContent = pcs.size === 1 ? '単音（' + a.notes[0].name + '）' : '該当するコード名が見つかりません';
    }

    if (t.ints && t.rows.length > 1) {
      ratio.append(t.ints.join(' : '));
      if (t.fundamental && t.ints[0] > 1 && t.fundamental.freq >= 20) {
        ratio.append(el('small', {}, '共通の基音 ' + E.midiName(t.fundamental.midi, state.spelling === 'flat') +
          ' ≈ ' + t.fundamental.freq.toFixed(1) + ' Hz'));
      }
    }
    if (pcs.size === 2) {
      const [x, y] = [...new Map(a.notes.map((n) => [n.pc, n])).values()];
      ratio.append(el('small', {}, '音程：' + x.name + ' → ' + y.name + '　' + E.intervalName(x, y)));
    }
    renderGauge(t);
    renderPlayStatus();
  }

  function renderGauge(t) {
    const g = $('gauge');
    g.replaceChildren();
    const cx = 160;
    const cy = 168;
    const R = 140;
    const DEG_PER_CENT = 1.6;
    const clamp = (c) => Math.max(-50, Math.min(50, c));
    const ang = (c) => ((-90 + clamp(c) * DEG_PER_CENT) * Math.PI) / 180;
    const pt = (c, r) => [cx + r * Math.cos(ang(c)), cy + r * Math.sin(ang(c))];
    const arc = (c0, c1, r) => {
      const [x0, y0] = pt(c0, r);
      const [x1, y1] = pt(c1, r);
      return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + r + ' ' + r + ' 0 0 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
    };

    g.append(svg('path', { class: 'g-arc', d: arc(-50, 50, R) }));
    g.append(svg('path', { class: 'g-arc-flat', d: arc(-50, -1, R + 6) }));
    g.append(svg('path', { class: 'g-arc-sharp', d: arc(1, 50, R + 6) }));
    for (let c = -50; c <= 50; c += 5) {
      const major = c % 25 === 0;
      const [x0, y0] = pt(c, R - (major ? 14 : 7));
      const [x1, y1] = pt(c, R);
      g.append(svg('line', {
        class: 'g-tick' + (c === 0 ? ' center' : major ? ' major' : ''),
        x1: x0, y1: y0, x2: x1, y2: y1,
      }));
      if (major) {
        const [lx, ly] = pt(c, R + 18);
        g.append(svg('text', { class: 'g-num', x: lx, y: ly + 3 }, c > 0 ? '+' + c : c < 0 ? '−' + -c : '0'));
      }
    }
    g.append(svg('text', { class: 'g-unit', x: cx, y: cy + 18 }, 'cents'));

    // 同じ音名（オクターブ違い）は1本の針にまとめる
    const groups = new Map();
    for (const r of t.rows) if (!groups.has(r.note.pc)) groups.set(r.note.pc, { offset: r.offset, name: r.note.name });
    const needles = [...groups.values()].sort((p, q) => p.offset - q.offset);
    let prev = null;
    for (const n of needles) {
      n.level = prev && Math.abs(n.offset - prev.offset) < 9 ? (prev.level + 1) % 4 : 0;
      prev = n;
    }
    needles.forEach((n, i) => {
      g.append(svg('g', {
        class: 'g-needle ' + centsClass(n.offset),
        style: 'transform: rotate(' + (clamp(n.offset) * DEG_PER_CENT).toFixed(2) + 'deg); animation-delay: ' + i * 40 + 'ms',
      }, svg('line', { x1: cx, y1: cy - 14, x2: cx, y2: cy - (R - 16) })));
    });
    needles.forEach((n) => {
      const [x, y] = pt(n.offset, R - 34 - n.level * 27);
      g.append(svg('g', { class: 'g-label ' + centsClass(n.offset) },
        svg('circle', { cx: x, cy: y, r: 11 }),
        svg('text', { x, y }, n.name)));
    });
    g.append(svg('circle', { class: 'g-hub', cx, cy, r: 7 }));
  }

  /* ------------------------------------------------------- candidates */

  function renderCandidates() {
    const a = state.analysis;
    const cands = a ? a.candidates : [];
    $('cand-block').hidden = cands.length < 2;
    const box = $('cands');
    box.replaceChildren();
    cands.slice(0, 12).forEach((c, i) => {
      box.append(el('button', {
        class: 'cand' + (i === state.selected ? ' active' : ''),
        'aria-pressed': i === state.selected ? 'true' : 'false',
        onclick: () => {
          state.selected = i;
          state.overrides = {};
          renderCandidates();
          renderTuningViews();
        },
      }, el('span', { class: 'n' }, c.name), el('span', { class: 's' }, String(-c.cost))));
    });
    $('cand-note').textContent = 'どの候補も同じ構成音です。タップすると、その解釈（ルート）で純正律を計算し直します。';
  }

  /* ------------------------------------------------------------ tuner */

  function meter(offset) {
    const pct = 50 + Math.max(-50, Math.min(50, offset));
    const m = el('div', { class: 'meter' }, el('div', { class: 'track' }));
    for (const t of [-50, -25, 0, 25, 50]) {
      m.append(el('div', { class: 'tick' + (t === 0 ? ' center' : ''), style: 'left:' + (50 + t) + '%' }));
    }
    m.append(el('div', { class: 'needle ' + centsClass(offset), style: 'left:' + pct + '%' }));
    return m;
  }

  function renderTuning() {
    const t = state.tuning;
    $('ji').hidden = !t;
    document.querySelectorAll('.a4-echo').forEach((n) => { n.textContent = fmtA4(state.a4); });
    if (!t) return;
    const cand = state.analysis.candidates[state.selected];
    const refText = { root: 'ルート', bass: '最低音', key: E.PC_NAMES_FLAT[state.tonic] + ' を主音' }[state.ref];
    $('ji-basis').textContent = (cand ? cand.name : t.root.name) + '・' + refText + '基準' +
      (state.ref !== 'root' ? '（ルートのずれ ' + fmtCents(t.refOffset) + '¢）' : '');

    const rows = $('ji-rows');
    rows.replaceChildren();
    t.rows.forEach((r, i) => {
      const opt = r.options[r.choice];
      const ratioBtn = el('button', {
        class: 'ratio-btn' + (r.isDefault ? '' : ' changed'),
        'aria-label': r.note.name + ' の純正比 ' + opt.label + (r.options.length > 1 ? '（タップで変更）' : ''),
        onclick: () => openSheet(i),
      }, opt.label, r.options.length > 1 ? el('span', { class: 'caret' }, '▼') : null);
      if (r.options.length < 2) ratioBtn.disabled = true;

      rows.append(el('div', { class: 'ji-row' },
        el('div', { class: 'ji-note' },
          el('span', { class: 'nm' }, r.note.name), el('span', { class: 'oct' }, String(r.note.octave)),
          el('span', { class: 'solf' }, r.note.solfege)),
        el('div', { class: 'ji-mid' },
          el('span', { class: 'deg' + (r.inChord ? '' : ' outside'), title: r.inChord ? '度数' : 'コード外の音' }, degLabel(r.degree)),
          ratioBtn,
          el('span', { class: 'ji-hz' },
            el('span', { class: 'lim' }, LIMIT_NAMES[opt.limit] || ''),
            r.freqJI.toFixed(2) + ' Hz')),
        el('div', { class: 'ji-cents ' + centsClass(r.offset) + '-t' }, fmtCents(r.offset), el('small', {}, '¢')),
        meter(r.offset)));
    });
  }

  /* ------------------------------------------------------- ratio sheet */

  function openSheet(rowIndex) {
    const r = state.tuning.rows[rowIndex];
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
    };
    const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': '純正比の選択' },
      el('div', { class: 'grabber' }),
      el('h3', {}, el('span', { class: 'nm' }, r.note.name + r.note.octave), '（' + degLabel(r.degree) + '）の純正比'),
      el('p', { class: 'hint' }, 'ルートからの比を選びます。右の数字はルートを基準にした平均律との差です。'));
    r.options.forEach((o, k) => {
      sheet.append(el('button', {
        class: 'opt' + (k === r.choice ? ' active' : ''),
        onclick: () => {
          state.overrides[rowIndex] = k;
          close();
          renderTuningViews();
        },
      },
      el('span', { class: 'r' }, o.label),
      el('span', { class: 'd' }, (RATIO_NAMES[o.label] || '') + (LIMIT_NAMES[o.limit] ? '・' + LIMIT_NAMES[o.limit] : '') +
        (k === r.defaultChoice ? '・既定' : '')),
      el('span', { class: 'c ' + centsClass(o.dev) + '-t' }, fmtCents(o.dev) + '¢')));
    });
    sheet.append(el('button', { class: 'close', onclick: () => close() }, '閉じる'));
    const backdrop = el('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, sheet);
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey);
    const active = sheet.querySelector('.opt.active');
    if (active) active.focus();
  }

  /* ---------------------------------------------------------- keyboard */

  const SPELL = {
    sharp: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]],
    flat: [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]],
  };

  const whiteIndex = (midi) => {
    let n = 0;
    for (let m = KEY_LOW; m < midi; m++) if (!BLACK.has(m % 12)) n++;
    return n;
  };

  function buildKeyboard() {
    const kb = $('keyboard');
    let whites = 0;
    for (let m = KEY_LOW; m <= KEY_HIGH; m++) {
      const black = BLACK.has(m % 12);
      const left = black ? whites * WHITE_W - 11 : whites * WHITE_W;
      if (!black) whites++;
      kb.append(el('button', {
        class: 'key ' + (black ? 'black' : 'white'),
        style: 'left:' + left + 'px',
        'data-midi': m,
        'aria-label': E.midiName(m, true),
        onclick: () => toggleKey(m),
      }));
    }
    kb.style.width = whites * WHITE_W + 'px';
  }

  function renderKeyboard() {
    const byMidi = new Map();
    if (state.tuning) for (const r of state.tuning.rows) byMidi.set(r.note.midi, r);
    for (const key of $('keyboard').children) {
      const m = Number(key.dataset.midi);
      const r = byMidi.get(m);
      key.classList.toggle('on', !!r);
      key.setAttribute('aria-pressed', r ? 'true' : 'false');
      key.replaceChildren();
      if (r) key.append(el('span', { class: 'k-cents' }, fmtCents(r.offset)));
      if (m % 12 === 0) key.append(el('span', { class: 'k-label' }, 'C' + (Math.floor(m / 12) - 1)));
    }
    syncSeg('spelling-seg', state.spelling);
  }

  function toggleKey(midi) {
    const notes = state.analysis ? state.analysis.notes : [];
    const list = notes.map((n) => ({ midi: n.midi, text: n.name + n.octave }));
    const at = list.findIndex((n) => n.midi === midi);
    if (at >= 0) list.splice(at, 1);
    else {
      const [l, acc] = SPELL[state.spelling][midi % 12];
      list.push({ midi, text: E.LETTERS[l] + (acc > 0 ? '♯' : acc < 0 ? '♭' : '') + (Math.floor(midi / 12) - 1) });
    }
    list.sort((x, y) => x.midi - y.midi);
    setInput(list.map((x) => x.text).join(' '));
  }

  function scrollKeyboard() {
    const notes = state.analysis ? state.analysis.notes : [];
    const target = notes.length ? notes[0].midi - 2 : 48;
    $('keyboard-scroll').scrollLeft = Math.max(0, whiteIndex(Math.max(KEY_LOW, target)) * WHITE_W - 8);
  }

  /* ------------------------------------------------------------- audio */

  function renderPlayStatus() {
    for (const k of ['et', 'ji', 'ab']) $('play-' + k).classList.remove('playing');
    const s = $('play-status');
    const p = state.piano;
    if (state.playing === 'loading') s.textContent = 'ピアノ音源を読み込み中… ' + p.loaded + ' / ' + p.total;
    else if (state.playing === 'et') s.textContent = '♪ 平均律（A4 = ' + fmtA4(state.a4) + ' Hz）で再生中';
    else if (state.playing === 'ji') s.textContent = '♪ 純正律で再生中';
    else if (p.failed) s.textContent = 'ピアノ音源を読み込めないため、簡易音で再生します。';
    else s.textContent = 'グランドピアノ音源 · A4 = ' + fmtA4(state.a4) + ' Hz · 消音モードでは鳴らない場合があります';
    if (state.playingButton && state.playing) $('play-' + state.playingButton).classList.add('playing');
  }

  function play(kind) {
    const t = state.tuning;
    if (!t) return;
    const et = t.rows.map((r) => r.freqET);
    const ji = t.rows.map((r) => r.freqJI);
    let steps;
    if (kind === 'et') steps = [{ freqs: et, dur: 3.2, label: 'et' }];
    else if (kind === 'ji') steps = [{ freqs: ji, dur: 3.2, label: 'ji' }];
    else steps = [et, ji, et, ji].map((f, i) => ({ freqs: f, dur: 2, label: i % 2 ? 'ji' : 'et' }));
    state.playingButton = kind;
    A.playSequence(steps, (label) => {
      state.playing = label;
      if (!label) state.playingButton = null;
      renderPlayStatus();
    });
  }

  /* --------------------------------------------------------- masthead */

  /** 長三和音 4:5:6 の波形を重ねた飾り線 */
  function drawWaves() {
    const g = $('mast-waves');
    const W = 360;
    const H = 44;
    [4, 5, 6].forEach((k, i) => {
      let d = '';
      for (let x = 0; x <= W; x += 2) {
        const y = H / 2 + Math.sin((x / W) * Math.PI * 2 * k) * (H / 2 - 4) * (0.55 + 0.45 * Math.sin((x / W) * Math.PI));
        d += (x ? 'L' : 'M') + x + ' ' + y.toFixed(2);
      }
      g.append(svg('path', { d, class: 'wave w' + i }));
    });
  }

  /* ---------------------------------------------------------- settings */

  function syncSeg(id, value) {
    document.querySelectorAll('#' + id + ' button').forEach((b) => {
      const on = b.dataset.value === String(value);
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function syncSettingsUI() {
    syncSeg('mode-seg', state.mode);
    syncSeg('ref-seg', state.ref);
    syncSeg('a4-seg', state.a4);
    $('tonic-select').value = String(state.tonic);
    $('tonic-setting').hidden = state.ref !== 'key';
    $('a4-input').value = state.a4;
    $('pill-a4').textContent = fmtA4(state.a4);
  }

  function onSettingsChanged() {
    saveSettings();
    syncSettingsUI();
    state.overrides = {};
    renderTuningViews();
  }

  function bindSeg(id, apply) {
    document.querySelectorAll('#' + id + ' button').forEach((b) => b.addEventListener('click', () => apply(b.dataset.value)));
  }

  /* -------------------------------------------------------------- init */

  function init() {
    loadSettings();

    const tonic = $('tonic-select');
    E.PC_NAMES_FLAT.forEach((n, i) => tonic.append(el('option', { value: i }, n + (i === 6 ? ' / F♯' : ''))));
    syncSettingsUI();
    buildKeyboard();
    drawWaves();

    const input = $('notes-input');
    let composing = false;
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => {
      composing = false;
      state.input = input.value;
      compute();
    });
    input.addEventListener('input', () => {
      if (composing) return;
      state.input = input.value;
      compute();
    });
    $('clear-input').addEventListener('click', () => {
      setInput('');
      input.focus();
    });
    $('kb-clear').addEventListener('click', () => setInput(''));
    $('keyboard-box').addEventListener('toggle', () => { if ($('keyboard-box').open) scrollKeyboard(); });

    bindSeg('spelling-seg', (v) => { state.spelling = v; saveSettings(); renderKeyboard(); });
    bindSeg('mode-seg', (v) => { state.mode = v; onSettingsChanged(); });
    bindSeg('ref-seg', (v) => { state.ref = v; onSettingsChanged(); });
    bindSeg('a4-seg', (v) => { state.a4 = Number(v); onSettingsChanged(); });
    tonic.addEventListener('change', (e) => { state.tonic = Number(e.target.value); onSettingsChanged(); });
    $('a4-input').addEventListener('change', (e) => {
      const v = Number(e.target.value);
      if (v >= 400 && v <= 480) state.a4 = v;
      onSettingsChanged();
    });
    $('pitch-pill').addEventListener('click', () => {
      $('settings').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    $('play-et').addEventListener('click', () => play('et'));
    $('play-ji').addEventListener('click', () => play('ji'));
    $('play-ab').addEventListener('click', () => play('ab'));

    if (location.hash.startsWith('#q=')) {
      try { state.input = decodeURIComponent(location.hash.slice(3)); } catch (e) { state.input = ''; }
      input.value = state.input;
    }
    compute();

    A.onStatus((s) => {
      state.piano = s;
      if (!$('play-row').hidden) renderPlayStatus();
    });
    // 最初の操作でピアノ音源を読み込み始める（iOS では操作前の音声処理が制限されるため）
    const warm = () => {
      A.load();
      window.removeEventListener('pointerdown', warm);
      window.removeEventListener('keydown', warm);
    };
    window.addEventListener('pointerdown', warm);
    window.addEventListener('keydown', warm);

    // Embedded in the tuner app: no service worker, so updates always load fresh.
  }

  init();
})();
