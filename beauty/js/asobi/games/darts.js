import { h, gameShell, playerPanel, showResult, toast, sfx, fitBoard, loadPref, savePref, confirm } from '../ui.js';
import * as D from './darts-logic.js';
import { real } from '../real/index.js';

const RULES = `
<p>1台を交互に持って、3本ずつ投げます。</p>
<ul>
<li>盤に指を置くと<b>照準</b>が出ます (指で隠れないよう少し上に出ます)。狙いを動かして、指を離すと投げます。</li>
<li>照準はゆらゆら揺れます。長く押していると<b>手がふるえて</b>揺れが大きくなるので、ねらったら早めに。</li>
<li>外側の細い輪は<b>ダブル</b> (2倍)、内側の細い輪は<b>トリプル</b> (3倍)。中心のブルは外が25点、内が50点です。</li>
</ul>
<table class="mini-table">
<tr><td>カウントアップ</td><td>8ラウンドで合計点の多いほうが勝ち</td></tr>
<tr><td>301 / 501</td><td>持ち点から引いていき、ぴったり0にしたら勝ち。0を下回ると<b>バースト</b>で、その番の得点はなかったことになります。ラウンドの上限まで決まらなければ残りの少ないほう</td></tr>
</table>`;

const NAMES = ['1P', '2P'];
const PCOLOR = ['#8fb3d1', '#e08a76'];
const PAPER = '#ebe4d6';
const INK = '#17151a';
const INDIGO = '#38506c';

export function mount(root) {
  let mode = loadPref('darts.mode', 'countup');
  let state, history, aim = null, flights = [], raf = 0, boardCache = null, cacheKey = '';
  const ui = gameShell(root, { title: 'ダーツ', rules: RULES, onUndo: undo, onRestart: restart });

  const seg = h('div', { class: 'segmented dt-modes' }, ['countup', '301', '501'].map((id) =>
    h('button', { 'data-mode': id, onclick: () => pickMode(id) }, D.MODES[id].label)));
  const plates = [0, 1].map((p) => playerPanel({ name: NAMES[p], mark: h('span', { class: `dt-mark p${p + 1}` }), color: PCOLOR[p] }));
  const plateRow = h('div', { class: 'dt-plates' }, plates.map((p) => p.el));
  const canvas = h('canvas', { class: 'dt-canvas', 'aria-label': 'ダーツ盤。押して狙い、離して投げる' });
  const wrap = h('div', { class: 'board-wrap dt-wrap' }, canvas);
  const slots = [0, 1, 2].map(() => h('span', { class: 'dt-slot' }));
  const roundEl = h('span', { class: 'dt-round' });
  const nextBtn = h('button', { class: 'btn primary dt-next', onclick: next });
  const strip = h('div', { class: 'dt-strip' }, roundEl, h('div', { class: 'dt-slots' }, slots), nextBtn);
  ui.main.append(seg, plateRow, wrap, strip);
  const unfit = fitBoard(ui.main, wrap, canvas);
  const ctx = canvas.getContext('2d');

  // ---- 状態 ----

  function restart() {
    state = D.newGame(mode);
    history = [];
    flights = [];
    render();
  }

  async function pickMode(id) {
    if (id === mode) return;
    const started = history.length > 0 && !state.over;
    if (started && !(await confirm('ゲームを最初からやり直して、モードを変えますか？'))) return;
    mode = id;
    savePref('darts.mode', id);
    sfx('tap');
    restart();
  }

  function undo() {
    if (!history.length) return;
    state = history.pop();
    flights = [];
    render();
  }

  function next() {
    if (!state.turnOver || state.over) return;
    sfx('tap');
    history.push(state);
    state = D.nextTurn(state);
    flights = [];
    render();
    if (state.over) setTimeout(finish, 300);
  }

  function throwAt(nx, ny) {
    history.push(state);
    const before = state;
    state = D.throwDart(state, nx, ny);
    const hit = state.darts[state.darts.length - 1].hit;
    flights.push({ x: nx, y: ny, t0: performance.now(), hit, player: before.turn });
    sfx(hit.points === 0 ? 'wall' : hit.m >= 2 || hit.n === 25 ? 'check' : 'place');
    if (state.bust) setTimeout(() => { sfx('error'); toast('BUST — この番の得点は無効'); }, 260);
    render();
    if (state.over) setTimeout(finish, 900);
  }

  async function finish() {
    sfx('win');
    const [a, b] = state.players.map((p) => p.score);
    const w = state.winner;
    const again = await showResult({
      title: w === null ? '引き分け' : `${NAMES[w]}の勝ち`,
      accent: w === null ? undefined : PCOLOR[w],
      detail: h('div', { class: 'score-line' },
        h('span', { class: 'p1' }, h('small', {}, '1P'), h('b', {}, a)),
        h('span', { class: 'vs' }, '−'),
        h('span', { class: 'p2' }, h('b', {}, b), h('small', {}, '2P'))),
    });
    if (again === 'again') restart();
  }

  function render() {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    const zeroOne = mode !== 'countup';
    plates.forEach((p, i) => {
      const me = state.players[i];
      const active = !state.over && state.turn === i;
      const way = zeroOne && active && !state.turnOver ? D.checkout(me.score, 3 - state.darts.length) : null;
      p.setInfo([h('span', { class: 'count' }, h('b', {}, me.score), zeroOne ? '残り' : '点'), way && h('span', { class: 'dt-way' }, way.join(' · '))]);
      p.setActive(active);
      p.setStatus(active ? (state.turnOver ? '交代' : '投げる番') : '');
    });
    roundEl.replaceChildren(h('small', {}, 'ROUND'), h('b', {}, Math.min(state.round, state.rounds)), h('small', {}, `/ ${state.rounds}`));
    slots.forEach((el, i) => {
      const d = state.darts[i];
      el.textContent = d ? d.hit.label : '';
      el.className = `dt-slot ${d ? 'on' : ''} ${d && (d.hit.m >= 2 || d.hit.n === 25) ? 'big' : ''} ${d && !d.hit.points ? 'miss' : ''}`;
    });
    const showNext = state.turnOver && !state.over;
    nextBtn.hidden = !showNext;
    nextBtn.textContent = state.bust ? 'バースト — 次の人へ' : '矢を抜いて次の人へ';
    ui.setUndoEnabled(history.length > 0);
    canvas.classList.toggle('waiting', showNext);
  }

  // ---- 盤の描画 ----

  function geometry() {
    const S = canvas.clientWidth;
    return { S, cx: S / 2, cy: S / 2, R: S * 0.385 };
  }

  function seasonal() {
    const cs = getComputedStyle(document.documentElement);
    return { kc: cs.getPropertyValue('--kc').trim() || '#bb5548' };
  }

  function buildBoard(S, dpr) {
    const { kc } = seasonal();
    const key = `${S}|${dpr}|${kc}`;
    if (key === cacheKey && boardCache) return boardCache;
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(S * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const cx = S / 2, cy = S / 2, R = S * 0.385;
    // 外周の黒い縁
    const rim = g.createRadialGradient(cx, cy, R, cx, cy, S * 0.5);
    rim.addColorStop(0, '#141217');
    rim.addColorStop(1, '#0a090c');
    g.fillStyle = rim;
    g.beginPath(); g.arc(cx, cy, S * 0.49, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(244,240,234,.16)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, S * 0.49, 0, Math.PI * 2); g.stroke();

    const ring = (r0, r1, color, a0, a1) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(cx, cy, r1 * R, a0, a1);
      g.arc(cx, cy, r0 * R, a1, a0, true);
      g.closePath();
      g.fill();
    };
    const { RING } = D;
    for (let i = 0; i < 20; i++) {
      const a0 = ((i * 18 - 9 - 90) * Math.PI) / 180, a1 = a0 + (18 * Math.PI) / 180;
      const even = i % 2 === 0;
      ring(RING.bullOut, RING.tripleIn, even ? INK : PAPER, a0, a1);
      ring(RING.tripleIn, RING.tripleOut, even ? kc : INDIGO, a0, a1);
      ring(RING.tripleOut, RING.doubleIn, even ? INK : PAPER, a0, a1);
      ring(RING.doubleIn, RING.doubleOut, even ? kc : INDIGO, a0, a1);
    }
    g.fillStyle = INDIGO;
    g.beginPath(); g.arc(cx, cy, RING.bullOut * R, 0, Math.PI * 2); g.fill();
    g.fillStyle = kc;
    g.beginPath(); g.arc(cx, cy, RING.bullIn * R, 0, Math.PI * 2); g.fill();

    // 麻縄の繊維
    const fib = real.sisal();
    if (fib) {
      g.save();
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
      g.fillStyle = g.createPattern(fib, 'repeat');
      g.globalAlpha = 0.9;
      g.fillRect(0, 0, S, S);
      g.restore();
      // 縁ほど少し沈む
      const dim = g.createRadialGradient(cx, cy, R * 0.6, cx, cy, R);
      dim.addColorStop(0, 'rgba(0,0,0,0)');
      dim.addColorStop(1, 'rgba(0,0,0,.18)');
      g.fillStyle = dim;
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    }

    // ワイヤー: 影を落として、上に細い金属線
    const wires = (dx, dy, style, w) => {
      g.strokeStyle = style;
      g.lineWidth = w;
      for (const r of [RING.bullIn, RING.bullOut, RING.tripleIn, RING.tripleOut, RING.doubleIn, RING.doubleOut]) {
        g.beginPath(); g.arc(cx + dx, cy + dy, r * R, 0, Math.PI * 2); g.stroke();
      }
      for (let i = 0; i < 20; i++) {
        const a = ((i * 18 - 9 - 90) * Math.PI) / 180;
        g.beginPath();
        g.moveTo(cx + dx + Math.cos(a) * RING.bullOut * R, cy + dy + Math.sin(a) * RING.bullOut * R);
        g.lineTo(cx + dx + Math.cos(a) * R, cy + dy + Math.sin(a) * R);
        g.stroke();
      }
    };
    const ww = Math.max(0.7, S / 620);
    wires(ww * 0.9, ww * 1.2, 'rgba(0,0,0,.45)', ww * 1.3);
    const metal = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    metal.addColorStop(0, '#f2f3f4');
    metal.addColorStop(0.5, '#9fa4aa');
    metal.addColorStop(1, '#dfe2e5');
    wires(0, 0, metal, ww);
    // 数字の輪 (針金)
    g.strokeStyle = 'rgba(220,224,228,.55)';
    g.lineWidth = ww;
    g.beginPath(); g.arc(cx, cy, S * 0.405, 0, Math.PI * 2); g.stroke();
    // 光沢
    const sheen = g.createRadialGradient(cx - R * 0.5, cy - R * 0.6, 0, cx - R * 0.5, cy - R * 0.6, R * 1.6);
    sheen.addColorStop(0, 'rgba(255,255,255,.08)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sheen;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();

    // 数字
    g.fillStyle = 'rgba(244,240,234,.92)';
    g.font = `italic 400 ${Math.round(S * 0.052)}px "Bodoni Moda", Didot, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    D.ORDER.forEach((n, i) => {
      const a = ((i * 18 - 90) * Math.PI) / 180;
      g.fillText(String(n), cx + Math.cos(a) * S * 0.44, cy + Math.sin(a) * S * 0.44);
    });
    boardCache = c;
    cacheKey = key;
    return c;
  }

  function drawDart(x, y, S, color, scale = 1, alpha = 1) {
    const L = S * 0.085 * scale;
    const dx = 0.42, dy = 0.9; // 手前 (右下) に向かって刺さっている
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    // 影
    ctx.strokeStyle = 'rgba(0,0,0,.4)';
    ctx.lineWidth = S * 0.012 * scale;
    ctx.beginPath(); ctx.moveTo(x + 2, y + 3); ctx.lineTo(x + dx * L + 5, y + dy * L + 8); ctx.stroke();
    // 胴 (金属)
    const g = ctx.createLinearGradient(x, y, x + dx * L, y + dy * L);
    g.addColorStop(0, '#d9d4cb');
    g.addColorStop(0.5, '#8f8a83');
    g.addColorStop(1, '#3b3936');
    ctx.strokeStyle = g;
    ctx.lineWidth = S * 0.011 * scale;
    ctx.beginPath(); ctx.moveTo(x + dx * L * 0.12, y + dy * L * 0.12); ctx.lineTo(x + dx * L * 0.62, y + dy * L * 0.62); ctx.stroke();
    // 先端
    ctx.strokeStyle = '#efe9df';
    ctx.lineWidth = S * 0.004 * scale;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * L * 0.14, y + dy * L * 0.14); ctx.stroke();
    // 羽根
    const fx = x + dx * L * 0.62, fy = y + dy * L * 0.62, ex = x + dx * L, ey = y + dy * L;
    const w = S * 0.022 * scale;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(ex + w, ey - w * 0.2); ctx.lineTo(ex, ey); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = alpha * 0.75;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(ex - w * 0.9, ey + w * 0.3); ctx.lineTo(ex, ey); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function sway(t, amount) {
    const x = Math.sin(t * 1.7) + 0.6 * Math.sin(t * 3.13 + 1.3) + 0.3 * Math.sin(t * 5.71 + 0.4);
    const y = Math.sin(t * 1.33 + 2.1) + 0.6 * Math.sin(t * 2.71 + 0.2) + 0.3 * Math.sin(t * 6.07 + 2.2);
    return [(x / 1.9) * amount, (y / 1.9) * amount];
  }
  const swayAmount = (held) => 0.025 + Math.min(1, Math.max(0, held - 0.6) / 2.2) * 0.085; // 盤の半径に対する割合

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { S, cx, cy, R } = geometry();
    if (!S) return;
    const px = Math.round(S * dpr);
    if (canvas.width !== px) { canvas.width = canvas.height = px; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buildBoard(S, dpr), 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 刺さった矢と、得点の文字
    for (const f of flights) {
      const age = (now - f.t0) / 1000;
      const x = cx + f.x * R, y = cy + f.y * R;
      const k = Math.min(1, age / 0.22);
      const ease = 1 - (1 - k) ** 3;
      const art = real.dart(PCOLOR[f.player]);
      if (art?.img?.complete && art.img.naturalWidth) {
        // 3D で撮った矢 (盤に落ちる影ごと)。先端が刺さった点に来るように置く
        const w = R * (1.0 + 0.9 * (1 - ease));
        ctx.globalAlpha = 0.25 + 0.75 * ease;
        ctx.drawImage(art.img, x - art.at[0] * w, y - art.at[1] * w, w, w);
        ctx.globalAlpha = 1;
      } else {
        drawDart(x, y, S, PCOLOR[f.player], 2.4 - 1.4 * ease, 0.25 + 0.75 * ease);
      }
      if (age < 1.4) {
        const a = Math.max(0, 1 - Math.max(0, age - 0.5) / 0.9);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.font = `italic 400 ${Math.round(S * 0.075)}px "Bodoni Moda", Didot, serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = f.hit.m >= 2 || f.hit.n === 25 ? '#ffffff' : 'rgba(244,240,234,.9)';
        ctx.shadowColor = 'rgba(0,0,0,.6)';
        ctx.shadowBlur = 12;
        ctx.fillText(f.hit.label === 'OUT' ? 'Out' : f.hit.label, x, y - S * 0.06 - age * S * 0.03);
        ctx.restore();
      }
    }

    // 照準
    if (aim) {
      const held = (now - aim.t0) / 1000;
      const amt = swayAmount(held) * R;
      const [sx, sy] = sway(now / 1000 + aim.seed, amt);
      const x = aim.x + sx, y = aim.y + sy;
      aim.cur = [x, y];
      const kc = seasonal().kc;
      ctx.save();
      ctx.strokeStyle = 'rgba(244,240,234,.85)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(aim.x, aim.y, Math.max(6, amt), 0, Math.PI * 2); ctx.setLineDash([2, 4]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x - 14, y); ctx.lineTo(x - 4, y); ctx.moveTo(x + 4, y); ctx.lineTo(x + 14, y);
      ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 4); ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 14);
      ctx.stroke();
      ctx.fillStyle = kc;
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // ---- 操作 ----

  function pointFor(e) {
    const r = canvas.getBoundingClientRect();
    const lift = e.pointerType === 'touch' ? Math.min(72, r.width * 0.2) : 0; // 指で隠れないよう上に出す
    return [e.clientX - r.left, e.clientY - r.top - lift];
  }

  function onDown(e) {
    if (state.over) return;
    if (state.turnOver) { next(); return; }
    canvas.setPointerCapture?.(e.pointerId);
    const [x, y] = pointFor(e);
    aim = { x, y, t0: performance.now(), seed: Math.random() * 100, id: e.pointerId };
    e.preventDefault();
  }
  function onMove(e) {
    if (!aim || e.pointerId !== aim.id) return;
    [aim.x, aim.y] = pointFor(e);
  }
  function onUp(e) {
    if (!aim || e.pointerId !== aim.id) return;
    const { cx, cy, R } = geometry();
    const [x, y] = aim.cur || [aim.x, aim.y];
    aim = null;
    // 離す瞬間のわずかなぶれ
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.012;
    throwAt((x - cx) / R + gauss(), (y - cy) / R + gauss());
  }
  function onCancel() { aim = null; }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);

  restart();
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); unfit(); };
}
