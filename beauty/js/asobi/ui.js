// 画面部品・設定・効果音など、各ゲームで共通して使うもの

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  appendChildren(el, children);
  return el;
}

export function s(tag, props = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  appendChildren(el, children);
  return el;
}

function applyProps(el, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
}

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// ---- 設定 (端末内に保存) ----

const SETTINGS_KEY = 'asobi.settings.v1';
const DEFAULTS = { faceToFace: false, sound: true };

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = loadSettings();

export function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 保存できなくても遊べる */ }
}

export function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem('asobi.' + key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function savePref(key, value) {
  try { localStorage.setItem('asobi.' + key, JSON.stringify(value)); } catch { /* 無視 */ }
}

// ---- 効果音 (Web Audio で合成) ----

let audio = null;

export function unlockAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    audio = null;
  }
}

function tone(freq, dur, { type = 'sine', gain = 0.15, delay = 0, slide = 0 } = {}) {
  const t0 = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function sfx(name, strength = 1) {
  if (!settings.sound) return;
  unlockAudio();
  if (!audio) return;
  try {
    switch (name) {
      case 'tap': tone(660, 0.05, { type: 'triangle', gain: 0.08 }); break;
      case 'place': tone(320, 0.09, { type: 'triangle', gain: 0.22, slide: 0.6 }); break;
      case 'flip': tone(520, 0.05, { type: 'triangle', gain: 0.08 }); break;
      case 'capture': tone(220, 0.12, { type: 'square', gain: 0.08, slide: 0.5 }); break;
      case 'roll':
        for (let i = 0; i < 6; i++) tone(300 + Math.random() * 500, 0.03, { type: 'square', gain: 0.04, delay: i * 0.05 });
        break;
      case 'hit': tone(900, 0.06, { type: 'square', gain: 0.05 + 0.1 * Math.min(1, strength) }); break;
      case 'wall': tone(420, 0.05, { type: 'triangle', gain: 0.06 + 0.1 * Math.min(1, strength) }); break;
      case 'goal': [523, 659, 784].forEach((f, i) => tone(f, 0.18, { type: 'triangle', gain: 0.15, delay: i * 0.09 })); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', gain: 0.15, delay: i * 0.12 })); break;
      case 'error': tone(140, 0.15, { type: 'sawtooth', gain: 0.06 }); break;
      case 'check': tone(880, 0.12, { type: 'triangle', gain: 0.12, delay: 0 }); tone(660, 0.16, { type: 'triangle', gain: 0.12, delay: 0.1 }); break;
      default: break;
    }
  } catch { /* 音が鳴らなくても遊べる */ }
}

// ---- アイコン ----

const ICONS = {
  back: 'M15 5l-7 7 7 7',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  restart: 'M4 12a8 8 0 108-8 8.5 8.5 0 00-6 2.5L4 8M4 3v5h5',
  help: 'M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01',
  pause: 'M9 5v14M15 5v14',
  share: 'M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6',
  people: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 6.5M18 14a6 6 0 013.5 6',
  sound: 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12',
};

export function icon(name) {
  const svg = s('svg', { viewBox: '0 0 24 24', class: 'icon', 'aria-hidden': 'true' });
  if (name === 'help') svg.append(s('circle', { cx: 12, cy: 12, r: 9.5 }));
  svg.append(s('path', { d: ICONS[name] }));
  return svg;
}

// ---- モーダル・トースト ----

const openOverlays = new Set();

export function closeAllOverlays() {
  for (const o of openOverlays) o.close(undefined);
}

export function modal({ title, body, buttons = [{ label: 'OK', value: true, primary: true }], flip = false, dismissible = true, className = '' }) {
  document.querySelector('.toast')?.remove();
  return new Promise((resolve) => {
    const panel = h('div', { class: `modal ${className}`, role: 'dialog', 'aria-modal': 'true' },
      title && h('h2', {}, title),
      body && h('div', { class: 'modal-body' }, body),
      h('div', { class: 'modal-buttons' },
        buttons.map((b) => h('button', {
          class: `btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}`,
          onclick: () => { sfx('tap'); close(b.value); },
        }, b.label))));
    if (flip) panel.classList.add('flip');
    const overlay = h('div', { class: 'overlay' }, panel);
    if (dismissible) {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(undefined); });
    }
    const entry = { close };
    function close(value) {
      if (!openOverlays.has(entry)) return;
      openOverlays.delete(entry);
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 160);
      resolve(value);
    }
    openOverlays.add(entry);
    document.body.append(overlay);
  });
}

export const confirm = (message, okLabel = 'はい') =>
  modal({
    body: h('p', {}, message),
    buttons: [{ label: 'いいえ', value: false }, { label: okLabel, value: true, primary: true }],
  }).then((v) => v === true);

let toastTimer = null;
export function toast(message, { flip = false, duration = 1600 } = {}) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: `toast ${flip ? 'flip' : ''}` }, message);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('closing');
    setTimeout(() => el.remove(), 250);
  }, duration);
}

// ---- ゲーム画面の共通レイアウト ----

export function gameShell(root, { title, rules, onUndo, onRestart }) {
  const undoBtn = onUndo && h('button', { class: 'icon-btn', 'aria-label': '待った', onclick: () => { sfx('tap'); onUndo(); } }, icon('undo'));
  const header = h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn', 'aria-label': 'メニューに戻る', onclick: () => { location.hash = '#asobi'; } }, icon('back')),
    h('h1', {}, title),
    h('div', { class: 'topbar-actions' },
      undoBtn,
      onRestart && h('button', {
        class: 'icon-btn',
        'aria-label': '最初から',
        onclick: async () => { if (await confirm('最初からやり直しますか？')) onRestart(); },
      }, icon('restart')),
      rules && h('button', { class: 'icon-btn', 'aria-label': 'ルール', onclick: () => showRules(title, rules) }, icon('help'))));
  const main = h('main', { class: 'game-main' });
  root.append(header, main);
  return {
    header,
    main,
    setUndoEnabled(on) { if (undoBtn) undoBtn.disabled = !on; },
  };
}

export function showRules(title, rules) {
  return modal({ title: `${title}のルール`, body: h('div', { class: 'rules', html: rules }), className: 'wide' });
}

// 対局の結果。'again' / 'close' / 'menu' を返す
export function showResult({ title, detail, accent = 'var(--kc)', mark = null, flip = false, buttons }) {
  // 印がないときは朱の判子を押す。引き分けは「和」
  const seal = h('div', { class: 'result-seal' }, /引き分け/.test(title) ? '和' : '勝');
  const hero = h('div', { class: 'result-hero', style: { '--accent': accent } },
    h('div', { class: 'result-burst' }),
    mark ? h('div', { class: 'result-mark' }, mark) : seal);
  return modal({
    title,
    body: [hero, detail && h('div', { class: 'result-detail' }, detail)],
    className: 'result',
    flip,
    buttons: buttons || [{ label: '閉じる', value: 'close' }, { label: 'もう一度', value: 'again', primary: true }],
  });
}

// プレイヤーの名札。flip すると上側の人から読める向きになる
export function playerPanel({ name, mark, flip = false, color = '' }) {
  const info = h('div', { class: 'plate-info' });
  const status = h('div', { class: 'plate-status' }, h('i'), h('span'));
  const el = h('div', { class: `plate ${flip ? 'flip' : ''}`, style: color ? { '--pc': color } : null },
    h('div', { class: 'plate-avatar' }, mark),
    h('div', { class: 'plate-text' }, h('div', { class: 'plate-name' }, name), info),
    status);
  return {
    el,
    setActive(on) { el.classList.toggle('active', on); },
    setInfo(content) { info.replaceChildren(...[content].flat().filter((c) => c != null && c !== '')); },
    setStatus(text) { status.lastChild.textContent = text || ''; el.classList.toggle('has-status', !!text); },
    setFlip(on) { el.classList.toggle('flip', on); },
  };
}

// 盤 (el) を、main から他の要素の高さを引いた残りに収まる最大サイズにする。
// 盤と名札がぴったり並び、余白は上下に均等に回る。
export function fitBoard(main, wrap, el, aspect = 1) {
  const update = () => {
    const cs = getComputedStyle(main);
    const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const gap = parseFloat(cs.rowGap) || 0;
    const kids = [...main.children];
    const others = kids.filter((c) => c !== wrap).reduce((a, c) => a + c.offsetHeight, 0) + gap * (kids.length - 1);
    const availH = main.clientHeight - padV - others;
    const availW = main.clientWidth - padH;
    if (availH <= 0 || availW <= 0) return;
    const width = Math.floor(Math.min(availW, availH / aspect));
    el.style.width = width + 'px';
    el.style.height = Math.floor(width * aspect) + 'px';
  };
  const ro = new ResizeObserver(update);
  ro.observe(main);
  for (const c of main.children) if (c !== wrap) ro.observe(c);
  update();
  return () => ro.disconnect();
}

export function stone(color, extraClass = '') {
  return h('span', { class: `stone-mark ${color} ${extraClass}` });
}

// ---- 共有の SVG グラデーション ----

export function ensureDefs() {
  if (document.getElementById('asobi-defs')) return;
  const svg = s('svg', { id: 'asobi-defs', width: 0, height: 0, 'aria-hidden': 'true', style: { position: 'absolute' } });
  svg.innerHTML = `<defs>
    <linearGradient id="cp-w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf7"/><stop offset="1" stop-color="#d6cbb6"/></linearGradient>
    <linearGradient id="cp-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5e5850"/><stop offset="1" stop-color="#171513"/></linearGradient>
    <radialGradient id="st-b" cx="0.36" cy="0.3" r="0.75"><stop offset="0" stop-color="#6e6e6e"/><stop offset="0.35" stop-color="#262626"/><stop offset="1" stop-color="#050505"/></radialGradient>
    <radialGradient id="st-w" cx="0.36" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#f1efe8"/><stop offset="1" stop-color="#bdb8ab"/></radialGradient>
    <linearGradient id="koma-wood" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#fbe9c0"/><stop offset="0.55" stop-color="#efcf8f"/><stop offset="1" stop-color="#dcb06a"/></linearGradient>
  </defs>`;
  document.body.prepend(svg);
}

// ---- 木目テクスチャ (canvas で一度だけ生成) ----

const woodCache = new Map();

export function woodTexture({ light = '#e9c27e', dark = '#c48d45', grain = '90,55,20', size = 512, seed = 7 } = {}) {
  const key = [light, dark, grain, size, seed].join();
  if (woodCache.has(key)) return woodCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, size, size * 0.3);
  base.addColorStop(0, light);
  base.addColorStop(0.5, dark);
  base.addColorStop(1, light);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  let r = seed;
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let i = 0; i < 140; i++) {
    const x0 = rand() * size * 1.2 - size * 0.1;
    const amp = 2 + rand() * 10;
    const freq = 0.004 + rand() * 0.01;
    const phase = rand() * 6.28;
    g.strokeStyle = `rgba(${grain},${0.02 + rand() * 0.06})`;
    g.lineWidth = 0.5 + rand() * 2.5;
    g.beginPath();
    for (let y = -10; y <= size + 10; y += 8) {
      const x = x0 + Math.sin(y * freq + phase) * amp + y * 0.08;
      if (y < 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  const url = c.toDataURL('image/jpeg', 0.85);
  woodCache.set(key, url);
  return url;
}

// ---- 和紙テクスチャ (盤の地。canvas で一度だけ生成) ----

const paperCache = new Map();

export function paperTexture({ base = '#ebe4d4', fiber = '120,100,70', size = 512, seed = 5 } = {}) {
  const key = [base, fiber, size, seed].join();
  if (paperCache.has(key)) return paperCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  let r = seed;
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  // 雲のようなむら
  for (let i = 0; i < 26; i++) {
    const x = rand() * size, y = rand() * size, rad = 40 + rand() * 140;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(${fiber},${0.03 + rand() * 0.04})`);
    grd.addColorStop(1, `rgba(${fiber},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  // 漉き込まれた繊維
  for (let i = 0; i < 420; i++) {
    const x = rand() * size, y = rand() * size, len = 6 + rand() * 26, a = rand() * Math.PI;
    g.strokeStyle = `rgba(${fiber},${0.05 + rand() * 0.1})`;
    g.lineWidth = 0.4 + rand() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * len * 0.5, y + Math.sin(a + 0.6) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  const url = c.toDataURL('image/jpeg', 0.86);
  paperCache.set(key, url);
  return url;
}
