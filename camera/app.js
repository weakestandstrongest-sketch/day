'use strict';

/*
 * 無音カメラ
 * 写真はカメラ映像のフレームを canvas に描いて JPEG にするだけなので、シャッター音は鳴りません。
 * ビデオは MediaRecorder で録画します（こちらも開始/終了音なし）。
 * 撮ったものは端末内（IndexedDB）に保存され、共有シートから写真アプリへ書き出します。
 */

const $ = (sel) => document.querySelector(sel);

const els = {
  camera: $('#camera'),
  controls: $('#controls'),
  stage: $('#stage'),
  frame: $('#frame'),
  video: $('#preview'),
  grid: $('#grid'),
  flash: $('#flash'),
  countdown: $('#countdown'),
  status: $('#status'),
  statusText: $('#status-text'),
  hudRes: $('#hud-res'),
  hudZoom: $('#hud-zoom'),
  datestamp: $('#datestamp'),
  lookVignette: $('#look-vignette'),
  lookGrain: $('#look-grain'),
  lookName: $('#look-name'),
  looks: $('#looks'),
  zoomLabel: $('#zoom-label'),
  lensMenu: $('#lens-menu'),
  message: $('#message'),
  messageText: $('#message-text'),
  btnRetry: $('#btn-retry'),
  veil: $('#veil'),
  intro: $('#intro'),
  btnGrid: $('#btn-grid'),
  btnTimer: $('#btn-timer'),
  timerBadge: $('#timer-badge'),
  btnDate: $('#btn-date'),
  btnTorch: $('#btn-torch'),
  btnLens: $('#btn-lens'),
  modes: document.querySelectorAll('.mode'),
  shutter: $('#btn-shutter'),
  btnGallery: $('#btn-gallery'),
  thumb: $('#thumb'),
  badge: $('#badge'),
  btnFlip: $('#btn-flip'),
  gallery: $('#gallery'),
  galleryCount: $('#gallery-count'),
  galleryGrid: $('#gallery-grid'),
  galleryEmpty: $('#gallery-empty'),
  btnGalleryClose: $('#btn-gallery-close'),
  btnSelect: $('#btn-select'),
  btnSaveMain: $('#btn-save-main'),
  btnDeleteMain: $('#btn-delete-main'),
  viewer: $('#viewer'),
  viewerInfo: $('#viewer-info'),
  viewerMedia: $('#viewer-media'),
  btnViewerClose: $('#btn-viewer-close'),
  qrScope: $('#qr-scope'),
  qrCard: $('#qr-card'),
  qrKind: $('#qr-kind'),
  qrText: $('#qr-text'),
  qrOpen: $('#qr-open'),
  qrCopy: $('#qr-copy'),
  qrClose: $('#qr-close'),
  btnViewerSave: $('#btn-viewer-save'),
  btnViewerDelete: $('#btn-viewer-delete'),
  toast: $('#toast'),
};

const TIMERS = [0, 3, 10];
const MAX_ZOOM = 10;

// フィルター。css はプレビュー用で、写真にも同じ色の変換をかける
const LOOKS = [
  { id: 'none', name: 'ORIGINAL', css: '' },
  { id: 'film', name: 'FILM', css: 'sepia(0.22) saturate(1.15) contrast(0.95) brightness(1.04)', vignette: 0.35, grain: 0.35 },
  { id: 'fade', name: 'FADE', css: 'contrast(0.82) brightness(1.1) saturate(0.75) hue-rotate(-10deg)', grain: 0.2 },
  { id: 'mono', name: 'MONO', css: 'grayscale(1) contrast(1.12) brightness(1.02)', grain: 0.4 },
  { id: 'noir', name: 'NOIR', css: 'grayscale(1) contrast(1.55) brightness(0.88)', vignette: 0.5, grain: 0.45 },
  { id: 'vivid', name: 'VIVID', css: 'saturate(1.45) contrast(1.08)' },
  { id: 'dusk', name: 'DUSK', css: 'sepia(0.3) hue-rotate(-30deg) saturate(1.25) contrast(1.05)', vignette: 0.3 },
];

/* ---------- 設定（この端末のブラウザにだけ保存） ---------- */

// 同じサイト（github.io）のほかのアプリと名前がぶつからないよう、アプリ名を付けたキーに保存する
const PREFS_KEY = 'silent-camera:prefs';
// ひび手帳（iPhone アプリ版）の中で開いたとき（camera/index.html?hibi=1）：撮ったものをひび手帳に渡し、iPhone の「写真」に入れてもらう。
// ひび手帳の画面がしまわれたらカメラを止め、また出たら動かす（iframe なので visibilitychange が来ない）
const IN_HIBI = new URLSearchParams(location.search).has('hibi') && window.parent !== window;
const hibiWaiting = new Map();
let hibiSeq = 0;
function hibiSave(item) {
  if (!IN_HIBI) return Promise.resolve(false);
  const id = ++hibiSeq;
  return new Promise((resolve) => {
    hibiWaiting.set(id, resolve);
    try { window.parent.postMessage({ type: 'hibi:save-media', id, blob: item.blob, mime: item.mime }, location.origin); } catch (e) { hibiWaiting.delete(id); resolve(false); }
    setTimeout(() => { if (hibiWaiting.delete(id)) resolve(false); }, 30000);
  });
}
if (IN_HIBI) {
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || !e.data) return;
    if (e.data.type === 'hibi:saved') { const r = hibiWaiting.get(e.data.id); if (r) { hibiWaiting.delete(e.data.id); r(!!e.data.ok); } }
    if (e.data.type === 'hibi:visible') {
      if (e.data.on) { startCamera(); setTimeout(() => fitFrame(), 60); }
      else { cancelCountdown(); stopRecording(); startSeq++; stopCamera(); }
    }
  });
}
const prefs = loadPrefs();

function loadPrefs() {
  const defaults = { grid: false, timer: 0, facing: 'environment', look: 'none', date: false };
  try {
    const raw = localStorage.getItem(PREFS_KEY) || localStorage.getItem('prefs') || '{}'; // 'prefs' は以前の保存先
    const p = { ...defaults, ...JSON.parse(raw) };
    if (!TIMERS.includes(p.timer)) p.timer = 0;
    if (p.facing !== 'user') p.facing = 'environment';
    if (!LOOKS.some((l) => l.id === p.look)) p.look = 'none';
    return { grid: !!p.grid, timer: p.timer, facing: p.facing, look: p.look, date: !!p.date };
  } catch {
    return defaults;
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 保存できなくても動作には影響しない
  }
}

function applyPrefsUI() {
  els.grid.hidden = !prefs.grid;
  els.btnGrid.setAttribute('aria-pressed', String(prefs.grid));
  els.timerBadge.hidden = !prefs.timer;
  els.timerBadge.textContent = prefs.timer;
  els.btnTimer.setAttribute('aria-pressed', String(prefs.timer > 0));
  els.btnTimer.setAttribute('aria-label', prefs.timer ? `セルフタイマー ${prefs.timer}秒` : 'セルフタイマー オフ');
  els.btnDate.setAttribute('aria-pressed', String(prefs.date));
  applyLook();
  drawPreviewStamp();
}

/* ---------- カメラ ---------- */

let mode = 'photo';
let deviceId = null;
let stream = null;
let track = null;
let micStream = null;
let startSeq = 0;
let lenses = [];
let zoomCaps = null;
let zoomMax = 1;
let currentZoom = 1;
let zoomFrame = null;
let torchOn = false;

function stopCamera() {
  qrStop();
  stopMic();
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  track = null;
  els.video.srcObject = null;
}

async function startCamera() {
  const seq = ++startSeq;
  startSwitch();
  stopCamera();
  hideMessage();

  if (!window.isSecureContext) {
    showMessage('カメラは https:// で開いたページでのみ使えます。', false);
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showMessage('このブラウザではカメラを使えません。iPhone の Safari で開いてください。', false);
    return;
  }

  const video = videoConstraints();
  if (deviceId) video.deviceId = { exact: deviceId };
  else video.facingMode = { ideal: prefs.facing };

  let s;
  try {
    s = await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (err) {
    if (seq !== startSeq) return;
    if (deviceId) {
      // 選んだレンズが使えなかったら通常のカメラで再試行
      deviceId = null;
      startCamera();
      return;
    }
    showMessage(cameraErrorText(err), true);
    return;
  }

  if (seq !== startSeq) {
    s.getTracks().forEach((t) => t.stop());
    return;
  }

  stream = s;
  track = s.getVideoTracks()[0];
  // 映像を映す部品（video 要素）も毎回新しく作る。
  // 前の映像の大きさなどの状態が残って、枠の中に小さく描かれたりしないように
  const v = createPreview();
  const old = els.video;
  old.removeAttribute('id');
  old.srcObject = null;
  old.replaceWith(v);
  els.video = v;
  applyLook();
  v.srcObject = s;
  try {
    await v.play();
  } catch {
    // autoplay は muted + playsinline なので通常は失敗しない
  }

  const settings = track.getSettings?.() || {};
  const facing = settings.facingMode || (deviceId ? guessFacing(track.label) : prefs.facing);
  els.video.classList.toggle('mirror', facing === 'user');

  if (mode === 'video') ensureMic();
  if (mode === 'qr') qrStart();
  scheduleSettle();
  setupCapabilities();
  updateHud();
  refreshLenses();
}

// カメラの起動・切り替え直後は、iPhone が一瞬ちがう形の映像サイズを報告してから落ち着く
// （落ち着くまでの時間はまちまち）。それに合わせて枠を変えると縮んでから伸びてがくっとするので、
// 枠はモードの形（写真 3:4、ビデオ 9:16）へすぐに変え、その形に合わない途中のサイズは無視する。
// 切り替えの間はぼかしで隠す。
const MODE_ASPECT = { photo: 4 / 3, video: 16 / 9, qr: 4 / 3, doc: 4 / 3 }; // 長辺 / 短辺
const SETTLE_FALLBACK_MS = 1500;
const SETTLE_GIVE_UP_MS = 4000;
let settleTimer = null;
let switchStartedAt = 0;
let fallbackTimer = null;
let veilTimer = null;
let frameDims = null;

function isPortraitScreen() {
  return window.innerHeight >= window.innerWidth;
}

function expectedDims() {
  const a = MODE_ASPECT[mode];
  return isPortraitScreen() ? [1, a] : [a, 1];
}

function matchesMode(w, h) {
  if (!w || !h) return false;
  const a = Math.max(w, h) / Math.min(w, h);
  return Math.abs(a - MODE_ASPECT[mode]) < 0.06 && (h >= w) === isPortraitScreen();
}

// 前のモードの形のままか、画面と縦横が逆なら、まだ切り替えの途中とみなす
function looksTransient(w, h) {
  const a = Math.max(w, h) / Math.min(w, h);
  const other = MODE_ASPECT[mode === 'video' ? 'photo' : 'video'];
  return Math.abs(a - other) < 0.06 || (h >= w) !== isPortraitScreen();
}

function startSwitch() {
  els.veil.classList.add('on');
  clearTimeout(veilTimer);
  veilTimer = setTimeout(endSwitch, SETTLE_GIVE_UP_MS + 500);
  fitFrame(expectedDims());
  switchStartedAt = performance.now();
  clearTimeout(fallbackTimer);
  fallbackTimer = setTimeout(settleFallback, SETTLE_FALLBACK_MS);
}

// 想定と違う形のカメラ（パソコンのカメラなど）でも、少し待てば実際の形に合わせる。
// ただし切り替え途中に見えるサイズなら、あきらめる時間までは待ち続ける
function settleFallback() {
  const w = els.video.videoWidth;
  const h = els.video.videoHeight;
  const waited = performance.now() - switchStartedAt;
  if (w && (!looksTransient(w, h) || waited >= SETTLE_GIVE_UP_MS)) {
    settle([w, h]);
    return;
  }
  if (waited < SETTLE_GIVE_UP_MS) fallbackTimer = setTimeout(settleFallback, 300);
}

function endSwitch() {
  clearTimeout(veilTimer);
  els.veil.classList.remove('on');
}

function scheduleSettle() {
  const w = els.video.videoWidth;
  const h = els.video.videoHeight;
  clearTimeout(settleTimer);
  if (!matchesMode(w, h)) return; // 途中のサイズ。落ち着くか、待ちきれなくなるまで待つ
  settleTimer = setTimeout(() => settle([w, h]), 150);
}

function settle(dims) {
  clearTimeout(settleTimer);
  clearTimeout(fallbackTimer);
  fitFrame(dims);
  updateHud();
  cameraReady();
  setTimeout(endSwitch, 150);
}

function videoConstraints() {
  if (mode === 'qr') return { width: { ideal: 1920 }, height: { ideal: 1440 } }; // QR は読めれば十分（大きすぎると読むのが遅い）
  return mode === 'photo'
    ? { width: { ideal: 4032 }, height: { ideal: 3024 } }
    : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
}

// マイクは映像とは別に取る。モード切り替えのたびにカメラを止めずに済むように
async function ensureMic() {
  if (micStream?.getAudioTracks().some((t) => t.readyState === 'live')) return;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (mode !== 'video' || !stream) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    micStream = s;
  } catch {
    toast('マイクが使えないため音声なしで録画します');
  }
}

function stopMic() {
  if (micStream) micStream.getTracks().forEach((t) => t.stop());
  micStream = null;
}

function createPreview() {
  const v = document.createElement('video');
  v.id = 'preview';
  v.autoplay = true;
  v.muted = true;
  v.playsInline = true;
  v.setAttribute('autoplay', '');
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
  v.addEventListener('loadedmetadata', scheduleSettle);
  v.addEventListener('resize', scheduleSettle);
  return v;
}

function cameraErrorText(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'カメラへのアクセスが許可されていません。\nSafari のアドレスバー左の「ぁあ」→「Webサイトの設定」→「カメラ」を「許可」にしてから再試行してください。';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'カメラが見つかりませんでした。';
    case 'NotReadableError':
    case 'AbortError':
      return 'カメラを起動できませんでした。他のアプリがカメラを使っていないか確認してください。';
    default:
      return `カメラを起動できませんでした（${err?.name || 'エラー'}）。`;
  }
}

function guessFacing(label = '') {
  return /front|前面|user|facetime/i.test(label) ? 'user' : 'environment';
}

// プレビュー枠を映像と同じ縦横比にして、写る範囲＝保存される範囲にする
// 横幅いっぱいに表示する。ボタンの上に収まるなら上の空きの中央に、
// 収まらない（ビデオの縦長映像など）ならボタンの裏まで伸ばす
function fitFrame(dims = frameDims || expectedDims()) {
  frameDims = dims;
  const [vw, vh] = dims;
  const cs = getComputedStyle(els.stage);
  const sw = els.stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const sh = els.stage.clientHeight;
  const above = sh - els.controls.offsetHeight;
  let w = sw;
  let h = (sw * vh) / vw;
  if (h > sh) {
    h = sh;
    w = (sh * vw) / vh;
  }
  els.frame.style.width = `${Math.floor(w)}px`;
  els.frame.style.height = `${Math.floor(h)}px`;
  els.frame.style.top = `${Math.max(0, Math.floor((above - h) / 2))}px`;
  drawPreviewStamp();
}

function setupCapabilities() {
  const caps = track?.getCapabilities?.() || {};

  zoomCaps = caps.zoom && caps.zoom.max > caps.zoom.min ? caps.zoom : null;
  if (zoomCaps) {
    zoomMax = Math.min(zoomCaps.max, MAX_ZOOM);
    currentZoom = track.getSettings().zoom ?? zoomCaps.min;
  }

  torchOn = false;
  els.btnTorch.hidden = !caps.torch;
  els.btnTorch.setAttribute('aria-pressed', 'false');
}

function setZoom(z, showLabel = true) {
  if (!zoomCaps || !track) return;
  currentZoom = Math.min(Math.max(z, zoomCaps.min), zoomMax);
  if (showLabel) showZoomLabel();
  if (zoomFrame == null) {
    zoomFrame = requestAnimationFrame(() => {
      zoomFrame = null;
      track?.applyConstraints({ advanced: [{ zoom: currentZoom }] }).catch(() => {});
    });
  }
}

let zoomLabelTimer = null;
function showZoomLabel() {
  els.zoomLabel.textContent = `${currentZoom.toFixed(1)}×`;
  els.zoomLabel.hidden = false;
  updateHud();
  clearTimeout(zoomLabelTimer);
  zoomLabelTimer = setTimeout(() => { els.zoomLabel.hidden = true; }, 900);
}

async function toggleTorch() {
  if (!track) return;
  const next = !torchOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: next }] });
    torchOn = next;
    els.btnTorch.setAttribute('aria-pressed', String(torchOn));
  } catch {
    toast('ライトを切り替えられませんでした');
  }
}

async function refreshLenses() {
  try {
    lenses = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  } catch {
    lenses = [];
  }
  // 前面＋背面の 2 つだけならフリップボタンで足りるので、3 つ以上あるときだけ出す
  els.btnLens.hidden = lenses.length <= 2;
}

function openLensMenu() {
  const current = track?.getSettings?.().deviceId;
  const buttons = lenses.map((d, i) => {
    const b = document.createElement('button');
    b.textContent = d.label || `カメラ ${i + 1}`;
    b.classList.toggle('active', d.deviceId === current);
    b.addEventListener('click', () => {
      deviceId = d.deviceId;
      prefs.facing = guessFacing(d.label);
      savePrefs();
      closeLensMenu();
      startCamera();
    });
    return b;
  });
  els.lensMenu.replaceChildren(...buttons);
  els.lensMenu.hidden = false;
}

function closeLensMenu() {
  els.lensMenu.hidden = true;
}

function flipCamera() {
  const current = els.video.classList.contains('mirror') ? 'user' : 'environment';
  prefs.facing = current === 'user' ? 'environment' : 'user';
  deviceId = null;
  els.btnFlip.classList.toggle('spin');
  savePrefs();
  startCamera();
}

function setMode(next) {
  if (next === mode || recorder || countdownTimer) return;
  mode = next;
  els.modes.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  els.shutter.classList.toggle('video-mode', mode === 'video');
  els.shutter.setAttribute('aria-label', mode === 'video' ? '録画開始' : mode === 'doc' ? '書類をスキャン' : '撮影');
  els.camera.classList.toggle('mode-photo', mode === 'photo');
  els.camera.classList.toggle('mode-video', mode === 'video');
  els.camera.classList.toggle('mode-qr', mode === 'qr');
  els.camera.classList.toggle('mode-doc', mode === 'doc');
  qrReset();
  applyLook();
  drawPreviewStamp();
  // モードが変わったら、カメラも映像の部品もいったん捨てて 1 から作り直す
  startCamera();
}


/* ---------- フィルター・日付スタンプ・画面上の表示 ---------- */

function currentLook() {
  return LOOKS.find((l) => l.id === prefs.look) || LOOKS[0];
}

function buildLooks() {
  const buttons = LOOKS.map((look) => {
    const b = document.createElement('button');
    b.className = 'look';
    b.dataset.look = look.id;
    b.setAttribute('role', 'radio');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.filter = look.css || 'none';
    b.append(swatch, look.name);
    b.addEventListener('click', () => setLook(look.id));
    return b;
  });
  els.looks.replaceChildren(...buttons);
  els.lookGrain.style.backgroundImage = `url(${grainTile().toDataURL('image/png')})`;
}

function setLook(id, announce = false) {
  if (prefs.look === id) return;
  prefs.look = id;
  savePrefs();
  applyLook();
  if (announce) showLookName();
}

function stepLook(delta) {
  const i = LOOKS.findIndex((l) => l.id === prefs.look);
  setLook(LOOKS[(i + delta + LOOKS.length) % LOOKS.length].id, true);
}

// ビデオにはフィルターがかからないので、ビデオモードではプレビューも素の映像にする
function applyLook() {
  const look = currentLook();
  const shown = mode === 'photo' ? look : LOOKS[0];
  els.video.style.filter = shown.css;
  els.lookVignette.style.opacity = shown.vignette || 0;
  els.lookGrain.style.opacity = shown.grain || 0;
  for (const b of els.looks.children) {
    const on = b.dataset.look === look.id;
    b.setAttribute('aria-checked', String(on));
    if (on && els.looks.scrollWidth > els.looks.clientWidth) {
      els.looks.scrollTo({ left: b.offsetLeft - (els.looks.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
    }
  }
}

let lookNameTimer = null;
function showLookName() {
  els.lookName.textContent = currentLook().name;
  els.lookName.classList.add('show');
  clearTimeout(lookNameTimer);
  lookNameTimer = setTimeout(() => els.lookName.classList.remove('show'), 700);
}

function updateHud() {
  const vw = els.video.videoWidth;
  const vh = els.video.videoHeight;
  const lens = els.video.classList.contains('mirror') ? 'FRONT' : 'BACK';
  els.hudRes.textContent = vw ? `${lens}  ${vw}×${vh}` : '';
  els.hudZoom.textContent = zoomCaps ? `${currentZoom.toFixed(1)}×` : '';
}

let grainCanvas = null;
function grainTile() {
  if (!grainCanvas) {
    const size = 128;
    grainCanvas = document.createElement('canvas');
    grainCanvas.width = size;
    grainCanvas.height = size;
    const ctx = grainCanvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 170;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  return grainCanvas;
}

// canvas の filter に対応しているか（Safari は版によって未対応）を実際に描いて確かめる
let canvasFilterOK = null;
function canvasFilterWorks() {
  if (canvasFilterOK == null) {
    try {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      const ctx = c.getContext('2d');
      ctx.filter = 'grayscale(1)';
      ctx.fillStyle = '#f00';
      ctx.fillRect(0, 0, 1, 1);
      const [r, g] = ctx.getImageData(0, 0, 1, 1).data;
      canvasFilterOK = Math.abs(r - g) < 12;
    } catch {
      canvasFilterOK = false;
    }
  }
  return canvasFilterOK;
}

// CSS の filter 関数（仕様の行列）を 1 つの色変換行列 [3x4] にまとめる
function cssFilterMatrix(css) {
  let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  const mul = (a, b) => {
    const r = new Array(12);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        let v = j === 3 ? a[i * 4 + 3] : 0;
        for (let k = 0; k < 3; k++) v += a[i * 4 + k] * b[k * 4 + j];
        r[i * 4 + j] = v;
      }
    }
    return r;
  };
  for (const [, fn, arg] of css.matchAll(/([a-z-]+)\(([^)]+)\)/g)) {
    const v = parseFloat(arg);
    let f;
    if (fn === 'brightness') {
      f = [v, 0, 0, 0, 0, v, 0, 0, 0, 0, v, 0];
    } else if (fn === 'contrast') {
      const o = 0.5 - 0.5 * v;
      f = [v, 0, 0, o, 0, v, 0, o, 0, 0, v, o];
    } else if (fn === 'saturate') {
      f = [
        0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v, 0,
        0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v, 0,
        0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v, 0,
      ];
    } else if (fn === 'grayscale') {
      const a = 1 - Math.min(1, v);
      f = [
        0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a, 0,
        0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a, 0,
        0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a, 0,
      ];
    } else if (fn === 'sepia') {
      const a = 1 - Math.min(1, v);
      f = [
        0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a, 0,
        0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a, 0,
        0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a, 0,
      ];
    } else if (fn === 'hue-rotate') {
      const rad = (v * Math.PI) / 180;
      const c = Math.cos(rad);
      const sn = Math.sin(rad);
      f = [
        0.213 + c * 0.787 - sn * 0.213, 0.715 - c * 0.715 - sn * 0.715, 0.072 - c * 0.072 + sn * 0.928, 0,
        0.213 - c * 0.213 + sn * 0.143, 0.715 + c * 0.285 + sn * 0.14, 0.072 - c * 0.072 - sn * 0.283, 0,
        0.213 - c * 0.213 - sn * 0.787, 0.715 - c * 0.715 + sn * 0.715, 0.072 + c * 0.928 + sn * 0.072, 0,
      ];
    } else {
      continue;
    }
    m = mul(f, m);
  }
  return m;
}

function applyMatrix(ctx, w, h, m) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const o0 = m[3] * 255;
  const o1 = m[7] * 255;
  const o2 = m[11] * 255;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    d[i] = m[0] * r + m[1] * g + m[2] * b + o0;
    d[i + 1] = m[4] * r + m[5] * g + m[6] * b + o1;
    d[i + 2] = m[8] * r + m[9] * g + m[10] * b + o2;
  }
  ctx.putImageData(img, 0, 0);
}

// プレビューの CSS（radial-gradient ellipse farthest-corner, 透明 45% → 黒 100%）と同じ形
function drawVignette(ctx, w, h, amount) {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(w / Math.SQRT2, h / Math.SQRT2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0.45, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${amount})`);
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

function drawGrain(ctx, w, h, amount) {
  const scale = Math.max(1, Math.min(w, h) / 1100);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = amount;
  ctx.scale(scale, scale);
  ctx.fillStyle = ctx.createPattern(grainTile(), 'repeat');
  ctx.fillRect(0, 0, w / scale, h / scale);
  ctx.restore();
}

// 昔のフィルムカメラ風の日付（7 セグメント表示）
const SEGMENTS = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
  5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

function stampText(d = new Date()) {
  const p2 = (n) => String(n).padStart(2, ' ');
  return `'${String(d.getFullYear()).slice(2)} ${p2(d.getMonth() + 1)} ${p2(d.getDate())}`;
}

function segAdvance(ch, size) {
  if (ch === "'") return size * 0.3;
  return size * 0.55 + size * 0.2;
}

function drawSevenSeg(ctx, text, x0, y0, size) {
  const dw = size * 0.55;
  const t = size * 0.13;
  const gap = t * 0.18;
  const skew = 0.1;
  const path = new Path2D();
  const poly = (pts, ox) => {
    pts.forEach(([x, y], i) => {
      const px = x0 + ox + x + (size - y) * skew;
      const py = y0 + y;
      if (i === 0) path.moveTo(px, py);
      else path.lineTo(px, py);
    });
    path.closePath();
  };
  const hseg = (y, ox) => {
    const x1 = gap;
    const x2 = dw - gap;
    poly([[x1, y], [x1 + t / 2, y - t / 2], [x2 - t / 2, y - t / 2], [x2, y], [x2 - t / 2, y + t / 2], [x1 + t / 2, y + t / 2]], ox);
  };
  const vseg = (x, y1, y2, ox) => {
    const a = y1 + gap;
    const b = y2 - gap;
    poly([[x, a], [x + t / 2, a + t / 2], [x + t / 2, b - t / 2], [x, b], [x - t / 2, b - t / 2], [x - t / 2, a + t / 2]], ox);
  };
  const mid = size / 2;
  let ox = 0;
  for (const ch of text) {
    const segs = SEGMENTS[ch];
    if (segs) {
      for (const s of segs) {
        if (s === 'a') hseg(0, ox);
        if (s === 'g') hseg(mid, ox);
        if (s === 'd') hseg(size, ox);
        if (s === 'f') vseg(0, 0, mid, ox);
        if (s === 'e') vseg(0, mid, size, ox);
        if (s === 'b') vseg(dw, 0, mid, ox);
        if (s === 'c') vseg(dw, mid, size, ox);
      }
    } else if (ch === "'") {
      poly([[t * 0.2, 0], [t * 1.2, 0], [t * 0.6, size * 0.28], [-t * 0.2, size * 0.28]], ox);
    }
    ox += segAdvance(ch, size);
  }
  ctx.save();
  ctx.fillStyle = '#ff9a3c';
  ctx.shadowColor = 'rgba(255, 96, 20, 0.95)';
  ctx.shadowBlur = size * 0.45;
  ctx.fill(path);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#ffc27a';
  ctx.fill(path);
  ctx.restore();
}

function drawDateStamp(ctx, w, h) {
  const base = Math.min(w, h);
  const size = base * 0.042;
  const text = stampText();
  let width = 0;
  for (const ch of text) width += segAdvance(ch, size);
  const margin = base * 0.09;
  drawSevenSeg(ctx, text, w - margin - width, h - margin - size, size);
}

function drawPreviewStamp() {
  const on = prefs.date && mode === 'photo';
  els.datestamp.hidden = !on;
  if (!on) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(els.frame.clientWidth * dpr);
  const h = Math.round(els.frame.clientHeight * dpr);
  if (!w || !h) return;
  els.datestamp.width = w;
  els.datestamp.height = h;
  drawDateStamp(els.datestamp.getContext('2d'), w, h);
}

/* ---------- QR コードを読む ----------
 * 映像の真ん中（四角の中）を少しずつ小さな絵にして、jsQR（vendor/jsqr.js：Apache License 2.0）で読む。
 * 読めたら、中身の種類（URL・Wi-Fi・電話・メール・テキスト）と「開く」「コピー」を出す。
 * jsQR は QR モードにしたときにだけ読み込む */
let qrTimer = null;
let qrCanvas = null;
let qrLib = null;
let qrShown = '';

function loadQrLib() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (qrLib) return qrLib;
  qrLib = new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'vendor/jsqr.js';
    sc.onload = () => resolve(window.jsQR);
    sc.onerror = () => { qrLib = null; reject(new Error('jsQR')); };
    document.head.append(sc);
  });
  return qrLib;
}

function qrStop() {
  clearTimeout(qrTimer);
  qrTimer = null;
}

function qrReset() {
  qrStop();
  qrShown = '';
  els.qrCard.hidden = true;
  els.qrScope.classList.remove('hit');
}

async function qrStart() {
  qrStop();
  let read;
  try { read = await loadQrLib(); } catch { toast('QRコードを読む部品を読み込めませんでした'); return; }
  const loop = () => {
    if (mode !== 'qr' || !stream) return;
    if (els.qrCard.hidden && !document.hidden) qrScan(read);
    qrTimer = setTimeout(loop, 160);
  };
  loop();
}

function qrScan(read) {
  const v = els.video, w = v.videoWidth, h = v.videoHeight;
  if (!w || !h) return;
  const side = Math.min(w, h) * 0.8, size = 480;
  if (!qrCanvas) qrCanvas = document.createElement('canvas');
  qrCanvas.width = qrCanvas.height = size;
  const cx = qrCanvas.getContext('2d', { willReadFrequently: true });
  cx.drawImage(v, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
  const img = cx.getImageData(0, 0, size, size);
  const code = read(img.data, size, size, { inversionAttempts: 'attemptBoth' });
  if (code && code.data && code.data !== qrShown) qrShow(code.data);
}

function qrParse(t) {
  const s = t.trim();
  if (/^https?:\/\//i.test(s)) return { kind: 'URL', text: s, open: s, label: '開く' };
  if (/^WIFI:/i.test(s)) {
    const f = (k) => (s.match(new RegExp(`[:;]${k}:((?:\\\\.|[^;])*)`, 'i')) || [])[1]?.replace(/\\(.)/g, '$1') || '';
    const ssid = f('S'), pass = f('P');
    return { kind: 'WI-FI', text: `ネットワーク：${ssid}${pass ? `\nパスワード：${pass}` : ''}`, copy: pass || ssid, copyLabel: pass ? 'パスワードをコピー' : 'コピー' };
  }
  if (/^tel:/i.test(s)) return { kind: 'TEL', text: s.slice(4), open: s, label: '電話をかける' };
  if (/^mailto:/i.test(s)) return { kind: 'MAIL', text: s.slice(7).split('?')[0], open: s, label: 'メールを書く' };
  if (/^smsto?:/i.test(s)) return { kind: 'SMS', text: s.replace(/^smsto?:/i, ''), open: s.replace(/^smsto:/i, 'sms:'), label: 'メッセージ' };
  if (/^geo:/i.test(s)) { const q = s.slice(4).split('?')[0]; return { kind: 'MAP', text: q, open: `https://maps.apple.com/?q=${encodeURIComponent(q)}`, label: '地図で開く' }; }
  if (/^BEGIN:VCARD/i.test(s)) { const n = (s.match(/\nFN:(.*)/i) || s.match(/\nN:(.*)/i) || [])[1] || '連絡先'; return { kind: 'CONTACT', text: n.trim(), copy: s }; }
  if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) return { kind: 'URL', text: s, open: 'https://' + s, label: '開く' };
  return { kind: 'TEXT', text: s };
}

function qrShow(data) {
  qrShown = data;
  const q = qrParse(data);
  els.qrScope.classList.add('hit');
  els.qrKind.textContent = q.kind;
  els.qrText.textContent = q.text;
  els.qrOpen.hidden = !q.open;
  els.qrOpen.textContent = q.label || '開く';
  els.qrOpen.dataset.url = q.open || '';
  els.qrCopy.textContent = q.copyLabel || 'コピー';
  els.qrCopy.dataset.text = q.copy || q.text;
  els.qrCard.hidden = false;
  try { navigator.vibrate?.(30); } catch {}
  // ひび手帳の中：iPhone の本物のふるえ
  try { window.parent !== window && window.parent.hibiHaptic?.('success'); } catch {}
}

function qrOpen() {
  const url = els.qrOpen.dataset.url;
  if (!url) return;
  // ひび手帳の中では、ひび手帳がアプリ内のブラウザ（または電話・メールのアプリ）で開く
  try { if (window.parent !== window && window.parent.hibiOpenURL) { window.parent.hibiOpenURL(url); return; } } catch {}
  if (/^https?:/i.test(url)) window.open(url, '_blank', 'noopener');
  else location.href = url;
}

async function qrCopy() {
  const text = els.qrCopy.dataset.text || '';
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {}
  if (!ok) {
    try { if (window.parent !== window && window.parent.hibiCopy) ok = await window.parent.hibiCopy(text); } catch {}
  }
  if (!ok) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
  }
  toast(ok ? 'コピーしました' : 'コピーできませんでした');
}

function qrClose() {
  els.qrCard.hidden = true;
  els.qrScope.classList.remove('hit');
  // 同じコードをすぐにまた出さないよう、少しのあいだは覚えておく
  setTimeout(() => { if (els.qrCard.hidden) qrShown = ''; }, 2500);
}

/* ---------- 書類スキャン（vFlat のように、撮った書類をまっすぐ・白くして保存）----------
 * ひび手帳のアプリ版：iPhone の書類スキャナー（VisionKit）で撮る。四すみを自動で見つけ、まっすぐにして、何枚でも続けて撮れる。
 * ブラウザ：撮った写真から書類の四すみを見つけ（指で直せる）、まっすぐに引きのばし、影を消して白くする */
const DOC = { src: null, quad: null, filter: 'clean', drag: -1, scale: 1 };

async function docShoot() {
  // ひび手帳のアプリ版：iPhone の書類スキャナー
  try {
    if (window.parent !== window && window.parent.hibiScanDoc && window.parent.hibiScanDoc.ok) {
      stopCamera(); // iPhone のスキャナーがカメラを使うので、こちらはいったん止める
      let pages = null;
      try { pages = await window.parent.hibiScanDoc(); } finally { startCamera(); }
      if (pages && pages.length) {
        for (const b64 of pages) await docSaveDataURL('data:image/jpeg;base64,' + b64);
        toast(`${pages.length}枚の書類を保存しました`);
      }
      if (pages) return; // null：スキャナーが使えなかった → ブラウザと同じやり方で
    }
  } catch (e) { console.error(e); }
  if (!track) return;
  const v = els.video, w = v.videoWidth, h = v.videoHeight;
  if (!w || !h) return;
  const c = document.createElement('canvas');
  const k = Math.min(1, 2400 / Math.max(w, h));
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  blink();
  DOC.src = c;
  DOC.quad = docDetect(c);
  DOC.filter = 'clean';
  docOpen();
}

async function docSaveDataURL(url) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  await docSaveCanvas(c);
}
async function docSaveCanvas(c) {
  const blob = await canvasToBlob(c, 'image/jpeg', 0.9);
  const thumb = await makeThumb(c, c.width, c.height);
  await addItem({ type: 'photo', blob, mime: 'image/jpeg', thumb, width: c.width, height: c.height, look: 'scan', createdAt: Date.now(), saved: false });
}

// 書類の四すみを見つける：小さくして明るさで2つに分け（大津の方法）、いちばん大きな明るいかたまりの角をとる
function docDetect(c) {
  const W = 220, H = Math.round(c.height * W / c.width), t = document.createElement('canvas');
  t.width = W; t.height = H;
  const x = t.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, g = new Uint8Array(W * H), hist = new Array(256).fill(0);
  for (let i = 0; i < W * H; i++) { const v = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) | 0; g[i] = v; hist[v]++; }
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128;
  for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = W * H - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, b = wB * wF * (mB - mF) ** 2; if (b > best) { best = b; th = i; } }
  const lab = new Int32Array(W * H).fill(-1); let bestN = 0, bestId = -1, id = 0;
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (g[i] <= th || lab[i] >= 0) continue;
    let n = 0; stack.push(i); lab[i] = id;
    while (stack.length) { const p = stack.pop(); n++; const px = p % W, py = (p / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const qx = px + dx, qy = py + dy; if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue; const q = qy * W + qx; if (lab[q] < 0 && g[q] > th) { lab[q] = id; stack.push(q); } } }
    if (n > bestN) { bestN = n; bestId = id; }
    id++;
  }
  const area = bestN / (W * H);
  const fallback = () => [[0.1, 0.08], [0.9, 0.08], [0.9, 0.92], [0.1, 0.92]].map(([u, v]) => [u * c.width, v * c.height]);
  if (bestId < 0 || area < 0.12 || area > 0.97) return fallback();
  let tl = [0, 0, Infinity], tr = [0, 0, -Infinity], br = [0, 0, -Infinity], bl = [0, 0, Infinity];
  for (let i = 0; i < W * H; i++) {
    if (lab[i] !== bestId) continue; const px = i % W, py = (i / W) | 0;
    if (px + py < tl[2]) tl = [px, py, px + py];
    if (px + py > br[2]) br = [px, py, px + py];
    if (px - py > tr[2]) tr = [px, py, px - py];
    if (px - py < bl[2]) bl = [px, py, px - py];
  }
  const k = c.width / W;
  return [tl, tr, br, bl].map(([px, py]) => [px * k, py * k]);
}

function docOpen() {
  const ed = document.getElementById('doc-edit'), src = document.getElementById('doc-src');
  src.width = DOC.src.width; src.height = DOC.src.height;
  src.getContext('2d').drawImage(DOC.src, 0, 0);
  src.hidden = false; document.getElementById('doc-out').hidden = true;
  document.getElementById('doc-quad').style.display = '';
  document.getElementById('doc-modes').hidden = true;
  document.getElementById('doc-title').textContent = '四すみを合わせる';
  document.getElementById('doc-hint').textContent = '丸を動かして、書類の四すみに合わせてください';
  document.getElementById('doc-next').textContent = '次へ';
  document.getElementById('doc-back').textContent = '撮り直す';
  ed.hidden = false; ed.dataset.step = 'crop';
  requestAnimationFrame(docDraw);
}
function docDraw() {
  const src = document.getElementById('doc-src'), svg = document.getElementById('doc-quad'), stage = document.getElementById('doc-stage');
  const r = src.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  DOC.scale = r.width / src.width;
  svg.style.left = (r.left - sr.left) + 'px'; svg.style.top = (r.top - sr.top) + 'px';
  svg.setAttribute('width', r.width); svg.setAttribute('height', r.height);
  const pts = DOC.quad.map(([x, y]) => [x * DOC.scale, y * DOC.scale]);
  svg.querySelector('polygon').setAttribute('points', pts.map((p) => p.join(',')).join(' '));
  svg.querySelectorAll('circle').forEach((c, i) => { c.setAttribute('cx', pts[i][0]); c.setAttribute('cy', pts[i][1]); });
}
function docPointer(e) {
  const svg = document.getElementById('doc-quad'), r = svg.getBoundingClientRect();
  const x = (e.clientX - r.left) / DOC.scale, y = (e.clientY - r.top) / DOC.scale;
  if (e.type === 'pointerdown') {
    let best = -1, bd = 1e9;
    DOC.quad.forEach(([qx, qy], i) => { const d = Math.hypot(qx - x, qy - y); if (d < bd) { bd = d; best = i; } });
    if (bd * DOC.scale < 60) { DOC.drag = best; svg.setPointerCapture(e.pointerId); }
    return;
  }
  if (e.type === 'pointermove' && DOC.drag >= 0) {
    DOC.quad[DOC.drag] = [Math.max(0, Math.min(DOC.src.width, x)), Math.max(0, Math.min(DOC.src.height, y))];
    docDraw();
    return;
  }
  if (e.type === 'pointerup' || e.type === 'pointercancel') DOC.drag = -1;
}

// 四すみ → まっすぐな長方形（射影変換）。できあがりの各点から、元の写真のどこかを逆に求めて色をとる
function docHomography(src, dst) {
  // dst[i] → src[i] の 3x3（8つの未知数をガウスの消去法で）
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = dst[i], [u, v] = src[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
function docWarp() {
  const q = DOC.quad, dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let W = Math.round(Math.max(dist(q[0], q[1]), dist(q[3], q[2]))), H = Math.round(Math.max(dist(q[0], q[3]), dist(q[1], q[2])));
  const k = Math.min(1, 2400 / Math.max(W, H)); W = Math.max(50, Math.round(W * k)); H = Math.max(50, Math.round(H * k));
  const m = docHomography(q, [[0, 0], [W, 0], [W, H], [0, H]]);
  const sd = DOC.src.getContext('2d').getImageData(0, 0, DOC.src.width, DOC.src.height), S = sd.data, SW = DOC.src.width, SH = DOC.src.height;
  const out = new ImageData(W, H), O = out.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const z = m[6] * x + m[7] * y + 1, u = (m[0] * x + m[1] * y + m[2]) / z, v = (m[3] * x + m[4] * y + m[5]) / z;
    const x0 = Math.max(0, Math.min(SW - 2, u | 0)), y0 = Math.max(0, Math.min(SH - 2, v | 0)), fx = Math.min(1, Math.max(0, u - x0)), fy = Math.min(1, Math.max(0, v - y0));
    const i00 = (y0 * SW + x0) * 4, i10 = i00 + 4, i01 = i00 + SW * 4, i11 = i01 + 4, o = (y * W + x) * 4;
    for (let ch = 0; ch < 3; ch++) O[o + ch] = (S[i00 + ch] * (1 - fx) + S[i10 + ch] * fx) * (1 - fy) + (S[i01 + ch] * (1 - fx) + S[i11 + ch] * fx) * fy;
    O[o + 3] = 255;
  }
  return out;
}
// 仕上げ：紙の明るさ（大きくぼかしたもの）で割って、影とむらを消して白くする
function docFinish(img, f) {
  const W = img.width, H = img.height, D = new Uint8ClampedArray(img.data);
  if (f !== 'color') {
    const sw = Math.max(8, Math.round(W / 24)), sh = Math.max(8, Math.round(H / 24));
    const a = document.createElement('canvas'); a.width = W; a.height = H; a.getContext('2d').putImageData(img, 0, 0);
    const b = document.createElement('canvas'); b.width = sw; b.height = sh;
    const bx = b.getContext('2d'); bx.filter = 'blur(2px)'; bx.drawImage(a, 0, 0, sw, sh);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(b, 0, 0, W, H);
    // 文字（暗いところ）に引っぱられないよう、ぼかした明るさは少し上げて紙の色とみなす
    const bg = cx.getImageData(0, 0, W, H).data;
    for (let i = 0; i < D.length; i += 4) {
      for (let ch = 0; ch < 3; ch++) { const p = Math.max(40, bg[i + ch] * 1.04); D[i + ch] = Math.min(255, (D[i + ch] / p) * 255); }
      if (f === 'mono') { const y = D[i] * 0.3 + D[i + 1] * 0.59 + D[i + 2] * 0.11, v = y > 200 ? 255 : y < 110 ? Math.max(0, y * 0.6) : (y - 110) / 90 * 255; D[i] = D[i + 1] = D[i + 2] = v; }
      else { for (let ch = 0; ch < 3; ch++) { const v = D[i + ch] / 255; D[i + ch] = Math.min(255, Math.pow(v, 1.6) * 268); } } // くっきり：紙はより白く、文字はより濃く
    }
  } else {
    // カラー：明るさの幅を広げるだけ
    let lo = 255, hi = 0; for (let i = 0; i < D.length; i += 16) { const y = D[i] * 0.3 + D[i + 1] * 0.59 + D[i + 2] * 0.11; if (y < lo) lo = y; if (y > hi) hi = y; }
    const s2 = 255 / Math.max(40, hi - lo); for (let i = 0; i < D.length; i += 4) for (let ch = 0; ch < 3; ch++) D[i + ch] = (D[i + ch] - lo) * s2;
  }
  return new ImageData(D, W, H);
}
let docFlat = null;
function docRender() {
  const out = document.getElementById('doc-out'), busy = document.getElementById('doc-busy');
  busy.hidden = false;
  setTimeout(() => {
    if (!docFlat) docFlat = docWarp();
    const img = docFinish(docFlat, DOC.filter);
    out.width = img.width; out.height = img.height; out.getContext('2d').putImageData(img, 0, 0);
    busy.hidden = true;
  }, 30);
}
function docStep2() {
  const ed = document.getElementById('doc-edit');
  ed.dataset.step = 'finish'; docFlat = null;
  document.getElementById('doc-src').hidden = true; document.getElementById('doc-quad').style.display = 'none';
  document.getElementById('doc-out').hidden = false; document.getElementById('doc-modes').hidden = false;
  document.getElementById('doc-title').textContent = '仕上がり';
  document.getElementById('doc-hint').textContent = '「くっきり」は影を消して、紙を白くします';
  document.getElementById('doc-next').textContent = '保存';
  document.getElementById('doc-back').textContent = '四すみに戻る';
  document.querySelectorAll('#doc-modes button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.f === DOC.filter)));
  docRender();
}
async function docSave() {
  const out = document.getElementById('doc-out');
  try { await docSaveCanvas(out); toast('書類を保存しました'); } catch (e) { console.error(e); toast('保存できませんでした'); }
  docClose();
}
function docClose() { document.getElementById('doc-edit').hidden = true; DOC.src = null; docFlat = null; }
function docInit() {
  const svg = document.getElementById('doc-quad');
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) svg.addEventListener(t, docPointer);
  document.getElementById('doc-next').addEventListener('click', () => { if (document.getElementById('doc-edit').dataset.step === 'crop') docStep2(); else docSave(); });
  document.getElementById('doc-back').addEventListener('click', () => { if (document.getElementById('doc-edit').dataset.step === 'finish') docOpen(); else docClose(); });
  document.getElementById('doc-modes').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; DOC.filter = b.dataset.f; document.querySelectorAll('#doc-modes button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); docRender(); });
  addEventListener('resize', () => { if (!document.getElementById('doc-edit').hidden && document.getElementById('doc-edit').dataset.step === 'crop') docDraw(); });
}

/* ---------- 撮影 ---------- */

let countdownTimer = null;

function onShutter() {
  if (countdownTimer) {
    cancelCountdown();
    return;
  }
  if (recorder) {
    stopRecording();
    return;
  }
  if (mode === 'doc') { docShoot(); return; }
  if (!track || mode === 'qr') return;
  const action = mode === 'photo' ? takePhoto : startRecording;
  if (prefs.timer > 0) startCountdown(prefs.timer, action);
  else action();
}

function startCountdown(sec, action) {
  let n = sec;
  showCount(n);
  els.countdown.hidden = false;
  els.shutter.classList.add('counting');
  countdownTimer = setInterval(() => {
    n -= 1;
    if (n <= 0) {
      cancelCountdown();
      action();
    } else {
      showCount(n);
    }
  }, 1000);
}

function showCount(n) {
  els.countdown.textContent = n;
  els.countdown.classList.remove('tick');
  void els.countdown.offsetWidth;
  els.countdown.classList.add('tick');
}

function cancelCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = null;
  els.countdown.hidden = true;
  els.shutter.classList.remove('counting');
}

function blink() {
  els.flash.classList.remove('on');
  void els.flash.offsetWidth; // アニメーションを毎回最初から再生する
  els.flash.classList.add('on');
}

async function takePhoto() {
  const v = els.video;
  const w = v.videoWidth;
  const h = v.videoHeight;
  if (!w || !h) return;

  const look = currentLook();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const gpuFilter = look.css && canvasFilterWorks();
  if (gpuFilter) ctx.filter = look.css;
  ctx.drawImage(v, 0, 0, w, h);
  ctx.filter = 'none';
  blink();

  try {
    const createdAt = Date.now();
    if (look.css && !gpuFilter) applyMatrix(ctx, w, h, cssFilterMatrix(look.css));
    if (look.vignette) drawVignette(ctx, w, h, look.vignette);
    if (look.grain) drawGrain(ctx, w, h, look.grain);
    if (prefs.date) drawDateStamp(ctx, w, h);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    const thumb = await makeThumb(canvas, w, h);
    await addItem({ type: 'photo', blob, mime: 'image/jpeg', thumb, width: w, height: h, look: look.id, createdAt, saved: false });
  } catch (err) {
    console.error(err);
    toast('写真を保存できませんでした');
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality);
  });
}

async function makeThumb(source, w, h) {
  const scale = Math.min(1, 360 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return canvasToBlob(c, 'image/jpeg', 0.8);
}

/* ---------- 録画 ---------- */

let recorder = null;
let recChunks = [];
let recStartedAt = 0;
let recThumb = null;
let recTick = null;

function pickVideoMime() {
  const candidates = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
}

async function startRecording() {
  if (!stream || typeof MediaRecorder === 'undefined') {
    toast('このブラウザでは録画できません');
    return;
  }
  const mime = pickVideoMime();
  let rec;
  try {
    const tracks = [...stream.getVideoTracks(), ...(micStream?.getAudioTracks() || [])];
    rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime } : undefined);
  } catch (err) {
    console.error(err);
    toast('録画を開始できませんでした');
    return;
  }

  const v = els.video;
  recThumb = v.videoWidth ? await makeThumb(v, v.videoWidth, v.videoHeight).catch(() => null) : null;
  recChunks = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) recChunks.push(e.data);
  };
  rec.onstop = () => finishRecording(rec, mime);
  try {
    rec.start(1000);
  } catch (err) {
    // マイクなしの映像に音声コーデックを指定したときなど、開始の時点で失敗することがある
    console.error(err);
    toast('録画を開始できませんでした');
    return;
  }

  recorder = rec;
  recStartedAt = Date.now();
  setRecordingUI(true);
  updateRecTime();
  recTick = setInterval(updateRecTime, 250);
}

function stopRecording() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}

async function finishRecording(rec, requestedMime) {
  recorder = null;
  clearInterval(recTick);
  setRecordingUI(false);

  const type = rec.mimeType || recChunks[0]?.type || requestedMime || 'video/mp4';
  const blob = new Blob(recChunks, { type });
  recChunks = [];
  if (!blob.size) {
    toast('録画データがありませんでした');
    return;
  }
  try {
    await addItem({
      type: 'video',
      blob,
      mime: type,
      thumb: recThumb,
      duration: (Date.now() - recStartedAt) / 1000,
      createdAt: recStartedAt,
      saved: false,
    });
  } catch (err) {
    console.error(err);
    toast('ビデオを保存できませんでした');
  }
}

function updateRecTime() {
  els.statusText.textContent = `REC ${formatDuration((Date.now() - recStartedAt) / 1000)}`;
}

function setRecordingUI(on) {
  els.status.classList.toggle('recording', on);
  if (!on) els.statusText.textContent = 'SILENT';
  els.shutter.classList.toggle('recording', on);
  els.shutter.setAttribute('aria-label', on ? '録画停止' : mode === 'video' ? '録画開始' : '撮影');
  for (const b of [els.btnFlip, els.btnGallery, els.btnLens, ...els.modes]) b.disabled = on;
}

/* ---------- 端末内の保存（IndexedDB） ---------- */

const DB_NAME = 'silent-camera';
const STORE = 'media';
let db = null;
const memStore = new Map();
let memSeq = 0;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb(txMode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, txMode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function dbAll() {
  if (!db) return [...memStore.values()];
  return idb('readonly', (s) => s.getAll());
}

async function dbPut(item) {
  if (db) {
    try {
      item.id = await idb('readwrite', (s) => s.put(item));
      return;
    } catch (err) {
      console.warn(err);
      db = null;
      toast('端末内に保存できないため、アプリを閉じると消えます。早めに写真アプリへ保存してください');
    }
  }
  if (item.id == null) item.id = `m${++memSeq}`;
  memStore.set(item.id, item);
}

async function dbDelete(id) {
  if (db) {
    try {
      await idb('readwrite', (s) => s.delete(id));
    } catch (err) {
      console.warn(err);
    }
  }
  memStore.delete(id);
}

/* ---------- 撮影データ ---------- */

let items = []; // 新しい順
const urlCache = new Map();

function getURL(item, kind) {
  const key = `${item.id}:${kind}`;
  if (!urlCache.has(key)) {
    const blob = kind === 'thumb' ? item.thumb : item.blob;
    if (!blob) return '';
    urlCache.set(key, URL.createObjectURL(blob));
  }
  return urlCache.get(key);
}

function revokeURLs(id) {
  for (const kind of ['thumb', 'full']) {
    const key = `${id}:${kind}`;
    if (urlCache.has(key)) {
      URL.revokeObjectURL(urlCache.get(key));
      urlCache.delete(key);
    }
  }
}

async function addItem(item) {
  await dbPut(item);
  items.unshift(item);
  // ひび手帳の中では、撮ったらすぐ iPhone の「写真」へ（入れられたら「保存済み」にする）
  if (IN_HIBI) hibiSave(item).then((ok) => { if (ok) { item.saved = true; dbPut(item).catch(() => {}); updateGalleryButton(); } });
  updateGalleryButton();
  els.btnGallery.classList.remove('pop');
  void els.btnGallery.offsetWidth;
  els.btnGallery.classList.add('pop');
  if (!els.gallery.hidden) renderGallery();
}

function updateGalleryButton() {
  const latest = items[0];
  const src = latest ? getURL(latest, 'thumb') : '';
  els.thumb.hidden = !src;
  if (src) els.thumb.src = src;
  const unsaved = items.filter((i) => !i.saved).length;
  els.badge.hidden = unsaved === 0;
  els.badge.textContent = unsaved;
}

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

function fileName(item) {
  const d = new Date(item.createdAt);
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${pad(d.getMilliseconds(), 3)}`;
  if (item.type === 'photo') return `IMG_${stamp}.jpg`;
  const ext = baseMime(item.mime) === 'video/webm' ? 'webm' : 'mp4';
  return `VID_${stamp}.${ext}`;
}

function baseMime(mime = '') {
  return mime.split(';')[0].trim();
}

function formatDuration(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

function formatDate(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 共有シートを開く。navigator.share はタップ直後に呼ぶ必要があるので、この関数の中では await より前に呼ぶ。
async function exportItems(list) {
  if (!list.length) return;
  const files = list.map((it) => new File([it.blob], fileName(it), { type: baseMime(it.mime) }));

  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files });
    } catch (err) {
      if (err.name !== 'AbortError') toast('共有できませんでした');
      return;
    }
  } else {
    for (const f of files) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    }
  }

  for (const it of list) {
    if (!it.saved) {
      it.saved = true;
      await dbPut(it);
    }
  }
  updateGalleryButton();
  if (!els.gallery.hidden) renderGallery();
  if (!els.viewer.hidden) renderViewer();
}

async function deleteItems(list) {
  if (!list.length) return false;
  const unsaved = list.filter((i) => !i.saved).length;
  const msg = unsaved
    ? `${list.length}件を削除します（うち${unsaved}件はまだ写真アプリに保存していません）。よろしいですか？`
    : `${list.length}件を削除します。よろしいですか？`;
  if (!confirm(msg)) return false;

  const ids = new Set(list.map((i) => i.id));
  for (const id of ids) {
    await dbDelete(id);
    revokeURLs(id);
    selected.delete(id);
  }
  items = items.filter((i) => !ids.has(i.id));
  updateGalleryButton();
  renderGallery();
  return true;
}

/* ---------- ライブラリ ---------- */

let selectMode = false;
const selected = new Set();

function openGallery() {
  closeLensMenu();
  els.gallery.hidden = false;
  renderGallery();
}

function closeGallery() {
  els.gallery.hidden = true;
  setSelectMode(false);
}

function setSelectMode(on) {
  selectMode = on;
  selected.clear();
  els.btnSelect.textContent = on ? 'キャンセル' : '選択';
  if (!els.gallery.hidden) renderGallery();
}

function renderGallery() {
  els.galleryCount.textContent = items.length ? `${items.length} SHOTS` : '';
  els.galleryEmpty.hidden = items.length > 0;
  els.galleryGrid.hidden = items.length === 0;
  els.btnSelect.disabled = items.length === 0;

  const frag = document.createDocumentFragment();
  items.forEach((it, index) => {
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.classList.toggle('selected', selectMode && selected.has(it.id));

    const src = getURL(it, 'thumb') || (it.type === 'photo' ? getURL(it, 'full') : '');
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      tile.append(img);
    }
    if (it.type === 'video') tile.append(tag('dur', `▶ ${formatDuration(it.duration || 0)}`));
    if (it.saved && !selectMode) {
      const saved = tag('saved', '');
      saved.innerHTML = '<svg><use href="#i-check"/></svg>';
      saved.setAttribute('aria-label', '保存済み');
      tile.append(saved);
    }
    if (selectMode) tile.append(tag('pick', ''));

    tile.addEventListener('click', () => {
      if (selectMode) {
        if (selected.has(it.id)) selected.delete(it.id);
        else selected.add(it.id);
        renderGallery();
      } else {
        openViewer(index);
      }
    });
    frag.append(tile);
  });
  els.galleryGrid.replaceChildren(frag);
  updateGalleryActions();
}

function tag(cls, text) {
  const s = document.createElement('span');
  s.className = `tag ${cls}`;
  s.textContent = text;
  return s;
}

function updateGalleryActions() {
  if (selectMode) {
    els.btnSaveMain.textContent = `保存 ${selected.size}`;
    els.btnDeleteMain.textContent = `削除 ${selected.size}`;
    els.btnSaveMain.disabled = selected.size === 0;
    els.btnDeleteMain.disabled = selected.size === 0;
  } else {
    const unsaved = items.filter((i) => !i.saved).length;
    const saved = items.length - unsaved;
    els.btnSaveMain.textContent = `すべて保存 ${unsaved}`;
    els.btnDeleteMain.textContent = `保存済を削除 ${saved}`;
    els.btnSaveMain.disabled = unsaved === 0;
    els.btnDeleteMain.disabled = saved === 0;
  }
}

function selectedItems() {
  return items.filter((i) => selected.has(i.id));
}

async function onSaveMain() {
  const list = selectMode ? selectedItems() : items.filter((i) => !i.saved);
  await exportItems(list);
  if (selectMode) setSelectMode(false);
}

async function onDeleteMain() {
  const list = selectMode ? selectedItems() : items.filter((i) => i.saved);
  if ((await deleteItems(list)) && selectMode) setSelectMode(false);
}

/* ---------- 1枚表示 ---------- */

let viewIndex = -1;
let swipeStartX = null;

function openViewer(index) {
  viewIndex = index;
  els.viewer.hidden = false;
  renderViewer();
}

function closeViewer() {
  els.viewer.hidden = true;
  els.viewerMedia.replaceChildren();
  viewIndex = -1;
}

function renderViewer() {
  const it = items[viewIndex];
  if (!it) {
    closeViewer();
    return;
  }
  let media;
  if (it.type === 'video') {
    media = document.createElement('video');
    media.controls = true;
    media.playsInline = true;
    media.setAttribute('playsinline', '');
    if (it.thumb) media.poster = getURL(it, 'thumb');
  } else {
    media = document.createElement('img');
    media.alt = '';
  }
  media.src = getURL(it, 'full');
  els.viewerMedia.replaceChildren(media);
  els.viewerInfo.textContent = `${viewIndex + 1}/${items.length}  ${formatDate(it.createdAt)}${it.saved ? '  SAVED' : ''}`;
}

function stepViewer(delta) {
  const next = viewIndex + delta;
  if (next < 0 || next >= items.length) return;
  viewIndex = next;
  renderViewer();
}

async function onViewerDelete() {
  const it = items[viewIndex];
  if (!it) return;
  if (await deleteItems([it])) {
    if (viewIndex >= items.length) viewIndex = items.length - 1;
    renderViewer();
  }
}

/* ---------- メッセージ・トースト ---------- */

function showMessage(text, canRetry) {
  endSwitch();
  cameraReady();
  els.messageText.textContent = text;
  els.messageText.style.whiteSpace = 'pre-line';
  els.btnRetry.hidden = !canRetry;
  els.message.hidden = false;
}

function hideMessage() {
  els.message.hidden = true;
}

let toastTimer = null;
function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}

/* ---------- イベント ---------- */

function bindEvents() {
  els.shutter.addEventListener('click', onShutter);
  els.qrOpen.addEventListener('click', qrOpen);
  els.qrCopy.addEventListener('click', qrCopy);
  els.qrClose.addEventListener('click', qrClose);
  docInit();
  els.btnFlip.addEventListener('click', flipCamera);
  els.btnGallery.addEventListener('click', openGallery);
  els.btnRetry.addEventListener('click', startCamera);
  els.modes.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  els.btnGrid.addEventListener('click', () => {
    prefs.grid = !prefs.grid;
    savePrefs();
    applyPrefsUI();
  });
  els.btnTimer.addEventListener('click', () => {
    prefs.timer = TIMERS[(TIMERS.indexOf(prefs.timer) + 1) % TIMERS.length];
    savePrefs();
    applyPrefsUI();
  });
  els.btnDate.addEventListener('click', () => {
    prefs.date = !prefs.date;
    savePrefs();
    applyPrefsUI();
    toast(prefs.date ? '日付を写真に入れます' : '日付スタンプをオフにしました');
  });
  els.btnTorch.addEventListener('click', toggleTorch);
  els.btnLens.addEventListener('click', (e) => {
    e.stopPropagation();
    if (els.lensMenu.hidden) openLensMenu();
    else closeLensMenu();
  });
  document.addEventListener('click', (e) => {
    if (!els.lensMenu.hidden && !els.lensMenu.contains(e.target)) closeLensMenu();
  });

  // ピンチでズーム、左右のスワイプでフィルター切り替え
  let pinch = null;
  let swipe = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  els.stage.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2 && zoomCaps) pinch = { d: dist(e.touches), z: currentZoom };
    swipe = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  els.stage.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      setZoom(pinch.z * (dist(e.touches) / pinch.d));
    }
  }, { passive: false });
  els.stage.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinch = null;
    if (!swipe || e.touches.length) return;
    const dx = e.changedTouches[0].clientX - swipe.x;
    const dy = e.changedTouches[0].clientY - swipe.y;
    swipe = null;
    if (mode === 'photo' && !countdownTimer && Math.abs(dx) > 50 && Math.abs(dy) < 60) stepLook(dx < 0 ? 1 : -1);
  });
  // iOS Safari のページ拡大を止める
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  window.addEventListener('resize', () => fitFrame());
  // ファインダーがたまに小さいまま残る：ホーム画面のアプリが裏から戻るときなど、iPhone が一瞬だけ小さい画面の大きさを
  // 伝えることがあり、そのとき測った大きさのままになっていた。置き場所の大きさが変わるたびと、戻ってきたあとに測り直す
  if (window.ResizeObserver) new ResizeObserver(() => fitFrame()).observe(els.stage);
  const refit = () => { fitFrame(); setTimeout(() => fitFrame(), 250); setTimeout(() => fitFrame(), 800); };
  window.addEventListener('pageshow', refit);
  window.addEventListener('orientationchange', refit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => fitFrame());

  els.btnGalleryClose.addEventListener('click', closeGallery);
  els.btnSelect.addEventListener('click', () => setSelectMode(!selectMode));
  els.btnSaveMain.addEventListener('click', onSaveMain);
  els.btnDeleteMain.addEventListener('click', onDeleteMain);

  els.btnViewerClose.addEventListener('click', closeViewer);
  els.btnViewerSave.addEventListener('click', () => {
    const it = items[viewIndex];
    if (it) exportItems([it]);
  });
  els.btnViewerDelete.addEventListener('click', onViewerDelete);
  els.viewerMedia.addEventListener('touchstart', (e) => {
    swipeStartX = e.touches.length === 1 ? e.touches[0].clientX : null;
  }, { passive: true });
  els.viewerMedia.addEventListener('touchend', (e) => {
    if (swipeStartX == null) return;
    const dx = e.changedTouches[0].clientX - swipeStartX;
    swipeStartX = null;
    if (Math.abs(dx) > 60) stepViewer(dx < 0 ? 1 : -1);
  });

  // アプリを裏に回したらカメラを止め、戻ったら再開
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelCountdown();
      stopRecording();
      startSeq++;
      stopCamera();
    } else {
      startCamera();
      setTimeout(() => fitFrame(), 250);
    }
  });
}

async function init() {
  buildLooks();
  applyPrefsUI();
  fitFrame(expectedDims());
  bindEvents();

  try {
    db = await openDB();
  } catch (err) {
    console.warn(err);
    db = null;
  }
  try {
    items = (await dbAll()).sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.warn(err);
    items = [];
  }
  updateGalleryButton();
  navigator.storage?.persist?.().catch(() => {});

  startCamera();
  setTimeout(cameraReady, 3500); // カメラがなかなか起動しなくても、起動画面は閉じる

  if ('serviceWorker' in navigator) {
    Promise.resolve().catch(() => {});
  }
}

/* ---------- 起動アニメーション ---------- */

let introDone = false;
let irisRot = 0;
let irisFrame = null;

const IRIS_BLADES = 7;
const IRIS_SHADES = ['#110f1c', '#151324', '#0f0d19', '#131121', '#100e1b', '#161427', '#0e0c17'];

// 絞り（アイリス）を描く。open は 0（閉じている）〜 1（画面の外まで開いている）
function drawIris(open, rot) {
  const svg = $('#iris');
  if (!svg) return;
  // 画面の大きさは #intro 自身から測る（ロゴの中心と同じ基準にするため）
  const box = els.intro.getBoundingClientRect();
  const w = box.width || window.innerWidth;
  const h = box.height || window.innerHeight;
  const cx = w / 2;
  const cy = h / 2;
  const reach = Math.hypot(w, h) / 2;
  // 多角形の穴の内接円が画面の角まで届くように開く
  const r = open * (reach / Math.cos(Math.PI / IRIS_BLADES)) * 1.02;
  const outer = reach + r + 20;
  const step = (2 * Math.PI) / IRIS_BLADES;
  const verts = [];
  const hits = [];
  for (let k = 0; k < IRIS_BLADES; k++) {
    const a = rot + k * step;
    const v = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    verts.push(v);
    // 頂点から、となりの頂点と逆の向きに辺を伸ばして外側の円とぶつかる点
    const d = a + step / 2 - Math.PI / 2;
    const dx = Math.cos(d);
    const dy = Math.sin(d);
    const fx = v[0] - cx;
    const fy = v[1] - cy;
    const b = fx * dx + fy * dy;
    const c = fx * fx + fy * fy - outer * outer;
    const t = -b + Math.sqrt(b * b - c);
    hits.push([v[0] + dx * t, v[1] + dy * t]);
  }
  const pt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;
  let paths = '';
  for (let k = 0; k < IRIS_BLADES; k++) {
    const n = (k + 1) % IRIS_BLADES;
    let a0 = Math.atan2(hits[k][1] - cy, hits[k][0] - cx);
    let a1 = Math.atan2(hits[n][1] - cy, hits[n][0] - cx);
    while (a1 < a0) a1 += 2 * Math.PI;
    let d = `M${pt(verts[k])} L${pt(hits[k])}`;
    for (let i = 1; i <= 12; i++) {
      const a = a0 + ((a1 - a0) * i) / 12;
      d += ` L${pt([cx + outer * Math.cos(a), cy + outer * Math.sin(a)])}`;
    }
    d += ` L${pt(verts[n])} Z`;
    paths += `<path d="${d}" fill="${IRIS_SHADES[k]}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`;
  }
  // 穴のふちを、アイコンと同じオーロラ色で光らせる
  if (open > 0) {
    const rim = verts.map(pt).join(' ');
    paths += `<polygon points="${rim}" fill="none" stroke="url(#aurora-stroke)" stroke-width="2" opacity="${(1 - open).toFixed(2)}"/>`;
  }
  svg.innerHTML = paths;
}

// 閉じている間は、羽根がゆっくり回る
function idleIris() {
  irisRot += 0.0025;
  drawIris(0, irisRot);
  irisFrame = requestAnimationFrame(idleIris);
}

function openIris() {
  cancelAnimationFrame(irisFrame);
  els.intro.classList.add('opening');
  document.body.classList.replace('booting', 'booted');
  const start = performance.now();
  const from = irisRot;
  const duration = 1000;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  (function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const e = ease(t);
    drawIris(e, from + e * 0.9);
    if (t < 1) requestAnimationFrame(step);
    else els.intro.remove();
  })(start);
}

// カメラの映像が落ち着いたら、絞りが開いて撮影画面に入る
function cameraReady() {
  if (introDone) return;
  introDone = true;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    document.body.classList.replace('booting', 'booted');
    els.intro.remove();
    return;
  }
  // ロゴが出そろうまでは待つ
  const wait = Math.max(0, 1700 - performance.now());
  setTimeout(() => {
    els.intro.querySelector('.intro-logo').style.transitionDelay = '0s';
    els.intro.classList.add('opening');
    setTimeout(openIris, 220);
  }, wait);
}

idleIris();

init();
