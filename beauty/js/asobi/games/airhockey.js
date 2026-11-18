import { real } from '../real/index.js';
import { h, icon, modal, showResult, sfx, showRules, loadPref, savePref } from '../ui.js';

const RULES = `
<p>iPhone を机に置いて、上下に向かい合って遊びます。自分側の半分に指を置くと、マレット (打つ道具) がついてきます。</p>
<ul>
<li>パック (円盤) を打って、相手のゴール (画面の端の明るい部分) に入れたら1点。</li>
<li>二人同時に操作できます。マレットは自分の陣地 (中央線まで) しか動けません。</li>
<li>先に目標点に届いたほうが勝ち。点を取られた側からパックが出ます。</li>
<li>左の一時停止ボタンでいつでも止められます。</li>
</ul>`;

// 盤の論理サイズ。横幅を 100 とし、縦は画面の比率に合わせる
const W = 100;
const PUCK_R = 4.6;
const MALLET_R = 7.8;
const GOAL_HALF = 18;
const MAX_PUCK = 360;      // 論理単位/秒
const MAX_MALLET = 520;
const WALL_E = 0.9;
const MALLET_E = 0.85;
const FRICTION = 0.18;     // 速度の減衰率 /秒
const SUBSTEPS = 8;
const COLORS = ['#8fb3d1', '#e08a76']; // 藍白と珊瑚。候のふたりの色

// 色を暗くする (#rrggbb のみ)
function shade(hex, k = 0.45) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * k);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function mount(root) {
  let H = 180;
  let target = loadPref('airhockey.target', 7);
  let score, puck, mallets, phase, phaseTimer, raf, last, scale = 1, paused = false;
  const pointers = new Map(); // pointerId -> player
  const trail = [];

  const canvas = h('canvas', { class: 'ah-canvas' });
  const pauseBtn = h('button', { class: 'ah-pause', 'aria-label': '一時停止', onclick: pause }, icon('pause'));
  const rotateNote = h('div', { class: 'ah-rotate' }, 'iPhone を縦向きにしてください');
  const wrap = h('div', { class: 'ah-wrap' }, canvas, pauseBtn, rotateNote);
  root.append(wrap);
  const ctx = canvas.getContext('2d');

  function resize() {
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    const oldH = H;
    scale = rect.width / W;
    H = Math.max(120, rect.height / scale);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    wrap.classList.toggle('landscape', rect.width > rect.height);
    if (puck && oldH !== H) {
      const k = H / oldH;
      puck.y *= k;
      for (const m of mallets) { m.y *= k; m.ty *= k; }
    }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  resize();

  function restart() {
    score = [0, 0];
    mallets = [
      { x: W / 2, y: H - 22, tx: W / 2, ty: H - 22, vx: 0, vy: 0 },
      { x: W / 2, y: 22, tx: W / 2, ty: 22, vx: 0, vy: 0 },
    ];
    serve(null);
    paused = false;
  }

  // conceded: 失点した側 (その陣地からパックを出す)。null は中央から
  function serve(conceded) {
    const y = conceded === null ? H / 2 : conceded === 0 ? H * 0.68 : H * 0.32;
    puck = { x: W / 2, y, vx: 0, vy: 0 };
    trail.length = 0;
    phase = 'play';
  }

  // ---- 入力 ----
  const toLogical = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = toLogical(e);
    const player = p.y > H / 2 ? 0 : 1;
    if ([...pointers.values()].includes(player)) return;
    pointers.set(e.pointerId, player);
    setTarget(player, p);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    e.preventDefault();
    setTarget(pointers.get(e.pointerId), toLogical(e));
  });
  const release = (e) => pointers.delete(e.pointerId);
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  function setTarget(player, p) {
    mallets[player].tx = p.x;
    mallets[player].ty = p.y;
  }

  // ---- 物理 ----
  function clampMallet(m, player) {
    m.x = Math.min(W - MALLET_R, Math.max(MALLET_R, m.x));
    const minY = player === 0 ? H / 2 + MALLET_R : MALLET_R;
    const maxY = player === 0 ? H - MALLET_R : H / 2 - MALLET_R;
    m.y = Math.min(maxY, Math.max(minY, m.y));
  }

  function step(dt) {
    mallets.forEach((m, player) => {
      const ox = m.x, oy = m.y;
      const dx = m.tx - m.x, dy = m.ty - m.y;
      const dist = Math.hypot(dx, dy);
      const move = Math.min(dist, MAX_MALLET * dt);
      if (dist > 1e-6) { m.x += (dx / dist) * move; m.y += (dy / dist) * move; }
      clampMallet(m, player);
      m.vx = (m.x - ox) / dt;
      m.vy = (m.y - oy) / dt;
    });

    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;

    mallets.forEach((m, player) => collideMallet(m, player));
    collideWalls();
    // 壁と挟まってめり込んだらマレットのほうを押し戻す
    mallets.forEach((m, player) => {
      const dx = puck.x - m.x, dy = puck.y - m.y;
      const d = Math.hypot(dx, dy), min = PUCK_R + MALLET_R;
      if (d < min && d > 1e-6) {
        m.x = puck.x - (dx / d) * min;
        m.y = puck.y - (dy / d) * min;
        clampMallet(m, player);
      }
    });

    const decay = Math.exp(-FRICTION * dt);
    puck.vx *= decay;
    puck.vy *= decay;
    const sp = Math.hypot(puck.vx, puck.vy);
    if (sp > MAX_PUCK) { puck.vx *= MAX_PUCK / sp; puck.vy *= MAX_PUCK / sp; }

    const inMouth = Math.abs(puck.x - W / 2) < GOAL_HALF;
    if (puck.y < 0) { if (inMouth) return goal(0); puck.y = PUCK_R; }
    if (puck.y > H) { if (inMouth) return goal(1); puck.y = H - PUCK_R; }
    return null;
  }

  function collideMallet(m, player) {
    let dx = puck.x - m.x, dy = puck.y - m.y;
    let d = Math.hypot(dx, dy);
    const min = PUCK_R + MALLET_R;
    if (d >= min) return;
    if (d < 1e-6) { dx = 0; dy = player === 0 ? -1 : 1; d = 1; }
    const nx = dx / d, ny = dy / d;
    puck.x = m.x + nx * min;
    puck.y = m.y + ny * min;
    const rel = (puck.vx - m.vx) * nx + (puck.vy - m.vy) * ny;
    if (rel < 0) {
      puck.vx -= (1 + MALLET_E) * rel * nx;
      puck.vy -= (1 + MALLET_E) * rel * ny;
      sfx('hit', -rel / 300);
    }
  }

  function collideWalls() {
    let hit = 0;
    if (puck.x < PUCK_R) { puck.x = PUCK_R; if (puck.vx < 0) { hit = -puck.vx; puck.vx = -puck.vx * WALL_E; } }
    if (puck.x > W - PUCK_R) { puck.x = W - PUCK_R; if (puck.vx > 0) { hit = puck.vx; puck.vx = -puck.vx * WALL_E; } }
    const inMouth = Math.abs(puck.x - W / 2) < GOAL_HALF;
    if (!inMouth) {
      if (puck.y < PUCK_R) { puck.y = PUCK_R; if (puck.vy < 0) { hit = -puck.vy; puck.vy = -puck.vy * WALL_E; } }
      if (puck.y > H - PUCK_R) { puck.y = H - PUCK_R; if (puck.vy > 0) { hit = puck.vy; puck.vy = -puck.vy * WALL_E; } }
    }
    // ゴールポスト (ゴール口の両端) は点として跳ね返す
    for (const py of [0, H]) {
      for (const px of [W / 2 - GOAL_HALF, W / 2 + GOAL_HALF]) {
        const dx = puck.x - px, dy = puck.y - py;
        const d = Math.hypot(dx, dy);
        if (d >= PUCK_R || d < 1e-6) continue;
        const nx = dx / d, ny = dy / d;
        puck.x = px + nx * PUCK_R;
        puck.y = py + ny * PUCK_R;
        const rel = puck.vx * nx + puck.vy * ny;
        if (rel < 0) { puck.vx -= (1 + WALL_E) * rel * nx; puck.vy -= (1 + WALL_E) * rel * ny; hit = -rel; }
      }
    }
    if (hit > 20) sfx('wall', hit / 300);
  }

  function goal(scorer) {
    score[scorer]++;
    sfx('goal');
    phase = score[scorer] >= target ? 'over' : 'goal';
    phaseTimer = 1.3;
    puck.vx = puck.vy = 0;
    if (phase === 'over') setTimeout(() => announceWinner(scorer), 700);
    return scorer;
  }

  async function announceWinner(winner) {
    sfx('win');
    const again = await showResult({
      title: `${winner === 0 ? '下' : '上'}の人の勝ち`,
      accent: COLORS[winner],
      detail: h('div', { class: 'score-line' },
        h('span', { style: { color: COLORS[0] } }, h('b', {}, score[0])),
        h('span', { class: 'vs' }, '−'),
        h('span', { style: { color: COLORS[1] } }, h('b', {}, score[1]))),
      flip: winner === 1,
      buttons: [{ label: 'メニューへ', value: 'menu' }, { label: 'もう一度', value: 'again', primary: true }],
    });
    if (again === 'again') restart();
    else if (again === 'menu') location.hash = '#asobi';
  }

  async function pause() {
    if (phase === 'over') return;
    paused = true;
    sfx('tap');
    const choice = await modal({
      title: '一時停止中',
      body: h('div', {},
        h('p', {}, `${score[0]} − ${score[1]}（${target}点先取）`),
        h('div', { class: 'segmented' }, [5, 7, 10].map((n) => h('button', {
          class: n === target ? 'on' : '',
          onclick: (e) => {
            target = n;
            savePref('airhockey.target', n);
            e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
          },
        }, `${n}点先取`)))),
      buttons: [
        { label: 'メニューへ', value: 'menu' },
        { label: 'ルール', value: 'rules' },
        { label: '最初から', value: 'restart' },
        { label: '再開', value: 'resume', primary: true },
      ],
    });
    if (choice === 'menu') { location.hash = '#asobi'; return; }
    if (choice === 'restart') restart();
    if (choice === 'rules') await showRules('エアホッケー', RULES);
    pointers.clear();
    paused = false;
    last = performance.now();
  }

  // ---- 描画 ----
  // 動かない盤面は大きさが変わったときだけ別の canvas に描いておく
  let table = null;

  function renderTable() {
    const dpr = canvas.width / (W * scale);
    table = document.createElement('canvas');
    table.width = canvas.width;
    table.height = canvas.height;
    const t = table.getContext('2d');
    t.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    const bg = t.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, H * 0.75);
    // 卓はいまの節気の深い色に、墨を重ねた漆のような地
    const deep = getComputedStyle(document.documentElement).getPropertyValue('--k-deep').trim() || '#10111a';
    bg.addColorStop(0, deep);
    bg.addColorStop(1, '#050507');
    t.fillStyle = bg;
    t.fillRect(0, 0, W, H);
    // 天板のつや
    const gloss = t.createLinearGradient(0, 0, W, H * 0.7);
    gloss.addColorStop(0, 'rgba(255,255,255,0.07)');
    gloss.addColorStop(0.42, 'rgba(255,255,255,0.015)');
    gloss.addColorStop(0.5, 'rgba(255,255,255,0)');
    t.fillStyle = gloss;
    t.fillRect(0, 0, W, H);
    for (const [y0, y1, color] of [[H, H / 2, '143,179,209'], [0, H / 2, '224,138,118']]) {
      const g = t.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, `rgba(${color},0.22)`);
      g.addColorStop(1, `rgba(${color},0)`);
      t.fillStyle = g;
      t.fillRect(0, Math.min(y0, y1), W, H / 2);
    }
    // エアの穴
    t.fillStyle = 'rgba(255,255,255,0.07)';
    for (let y = 4; y < H; y += 6) {
      for (let x = (y / 6) % 2 ? 4 : 7; x < W; x += 6) {
        t.beginPath(); t.arc(x, y, 0.45, 0, Math.PI * 2); t.fill();
      }
    }
    t.lineWidth = 0.7;
    t.strokeStyle = 'rgba(255,255,255,0.28)';
    t.beginPath(); t.moveTo(0, H / 2); t.lineTo(W, H / 2); t.stroke();
    t.beginPath(); t.arc(W / 2, H / 2, 15, 0, Math.PI * 2); t.stroke();
    t.fillStyle = 'rgba(255,255,255,0.35)';
    t.beginPath(); t.arc(W / 2, H / 2, 1.6, 0, Math.PI * 2); t.fill();
    for (const [py, color, start] of [[0, COLORS[1], 0], [H, COLORS[0], Math.PI]]) {
      t.strokeStyle = color;
      t.globalAlpha = 0.55;
      t.lineWidth = 0.8;
      t.beginPath(); t.arc(W / 2, py, GOAL_HALF + 7, start, start + Math.PI); t.stroke();
      t.globalAlpha = 1;
      const glow = t.createRadialGradient(W / 2, py, 2, W / 2, py, GOAL_HALF + 4);
      glow.addColorStop(0, color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      t.globalAlpha = 0.35;
      t.fillStyle = glow;
      t.fillRect(W / 2 - GOAL_HALF - 4, py - GOAL_HALF - 4, GOAL_HALF * 2 + 8, GOAL_HALF * 2 + 8);
      t.globalAlpha = 1;
    }
    // 枠 (ゴール口は開けておく)
    t.strokeStyle = 'rgba(244,240,234,0.5)';
    t.lineWidth = 1.6;
    t.beginPath();
    t.moveTo(W / 2 - GOAL_HALF, 0.8); t.lineTo(0.8, 0.8); t.lineTo(0.8, H - 0.8); t.lineTo(W / 2 - GOAL_HALF, H - 0.8);
    t.moveTo(W / 2 + GOAL_HALF, 0.8); t.lineTo(W - 0.8, 0.8); t.lineTo(W - 0.8, H - 0.8); t.lineTo(W / 2 + GOAL_HALF, H - 0.8);
    t.stroke();
    for (const [py, color] of [[0, COLORS[1]], [H, COLORS[0]]]) {
      t.strokeStyle = color;
      t.lineWidth = 2.4;
      t.shadowColor = color;
      t.shadowBlur = 8;
      t.beginPath(); t.moveTo(W / 2 - GOAL_HALF, py); t.lineTo(W / 2 + GOAL_HALF, py); t.stroke();
      t.shadowBlur = 0;
    }
  }

  function drawMallet(m, color) {
    const art = real.hockey(`mallet${COLORS.indexOf(color)}`);
    if (art) {
      // 3D で撮ったマレット (直径 1 が画像の 1/1.4)
      const w = MALLET_R * 2.8;
      ctx.drawImage(art, m.x - w / 2, m.y - w / 2, w, w);
      return;
    }
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(m.x + 1, m.y + 1.6, MALLET_R, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    const g = ctx.createRadialGradient(m.x - 2.5, m.y - 3, 1, m.x, m.y, MALLET_R);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, color);
    g.addColorStop(1, shade(color));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(m.x, m.y, MALLET_R, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(m.x, m.y, MALLET_R * 0.62, 0, Math.PI * 2); ctx.stroke();
    const k = ctx.createRadialGradient(m.x - 1.2, m.y - 1.6, 0.3, m.x, m.y, MALLET_R * 0.45);
    k.addColorStop(0, '#ffffff');
    k.addColorStop(0.4, color);
    k.addColorStop(1, shade(color));
    ctx.fillStyle = k;
    ctx.beginPath(); ctx.arc(m.x, m.y, MALLET_R * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPuck() {
    const art = real.hockey('puck');
    if (art) {
      const w = PUCK_R * 2.8;
      ctx.drawImage(art, puck.x - w / 2, puck.y - w / 2, w, w);
      return;
    }
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.arc(puck.x + 0.8, puck.y + 1.2, PUCK_R, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'rgba(244,240,234,0.9)';
    ctx.shadowBlur = 10;
    const g = ctx.createRadialGradient(puck.x - 1.5, puck.y - 1.8, 0.5, puck.x, puck.y, PUCK_R);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#f4f0ea');
    g.addColorStop(1, '#b9b0a0');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(puck.x, puck.y, PUCK_R, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(60,50,40,0.45)';
    ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.arc(puck.x, puck.y, PUCK_R * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawScore(value, color, player) {
    ctx.save();
    ctx.translate(W - 7, H / 2 + (player === 0 ? 11 : -11));
    if (player === 1) ctx.rotate(Math.PI);
    ctx.font = 'italic 400 14px "Bodoni Moda", Didot, serif';
    ctx.textAlign = player === 0 ? 'right' : 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillText(value, 0, 0);
    ctx.restore();
  }

  function draw() {
    if (!table || table.width !== canvas.width || table.height !== canvas.height) renderTable();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(table, 0, 0);
    ctx.restore();

    drawScore(score[0], COLORS[0], 0);
    drawScore(score[1], COLORS[1], 1);

    trail.forEach((t, i) => {
      ctx.globalAlpha = (i / trail.length) * 0.22;
      ctx.fillStyle = '#f4f0ea';
      ctx.beginPath();
      ctx.arc(t.x, t.y, PUCK_R * (0.45 + 0.55 * i / trail.length), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawPuck();
    mallets.forEach((m, i) => drawMallet(m, COLORS[i]));

    if (phase === 'goal' || phase === 'over') {
      // 得点した側から読める向きで表示
      ctx.save();
      ctx.translate(W / 2, H / 2 + (goalScorer === 0 ? 30 : -30));
      if (goalScorer === 1) ctx.rotate(Math.PI);
      ctx.font = 'italic 400 20px "Bodoni Moda", Didot, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = COLORS[goalScorer];
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#fff';
      ctx.fillText(phase === 'over' ? 'Win.' : 'Goal.', 0, 0);
      ctx.restore();
    }
  }

  let goalScorer = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const elapsed = Math.min(0.033, (now - (last ?? now)) / 1000);
    last = now;
    if (!paused && !document.hidden) {
      if (phase === 'play' && elapsed > 0) {
        const dt = elapsed / SUBSTEPS;
        for (let i = 0; i < SUBSTEPS; i++) {
          const scored = step(dt);
          if (scored !== null) { goalScorer = scored; break; }
        }
        trail.push({ x: puck.x, y: puck.y });
        if (trail.length > 8) trail.shift();
      } else if (phase === 'goal') {
        phaseTimer -= elapsed;
        if (phaseTimer <= 0) serve(1 - goalScorer);
      }
    }
    draw();
  }

  restart();
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
  };
}
