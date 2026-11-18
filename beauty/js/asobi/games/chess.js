import { h, gameShell, playerPanel, modal, showResult, sfx, settings, fitBoard, ensureDefs, think, CPU_LEVELS } from '../ui.js';
import { chessMove } from '../ai.js';
import * as C from './chess-logic.js';
import { pieceSVG } from './chess-pieces.js';
import { real } from '../real/index.js';

const RULES = `
<p>相手のキングを逃げられない状態 (チェックメイト) にしたら勝ちです。白が先手です。</p>
<ul>
<li>自分の駒をタップすると動ける場所が表示されます。行き先をタップして移動します。</li>
<li><b>キャスリング</b>: キングを2マス横に動かすと、ルークが自動で反対側に移ります。</li>
<li><b>アンパッサン</b>・<b>プロモーション (昇格)</b> にも対応しています。昇格時は駒を選べます。</li>
<li>ステイルメイト・駒不足・50手ルール・同一局面3回は引き分けです。</li>
</ul>`;

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAMES = { w: '白', b: '黒' };
const FILES = 'abcdefgh';

// 3D で撮った駒があればそれを、なければもとの絵を使う
function pieceArt(t, c, extra = '') {
  const shot = real.chess(c, t);
  if (!shot) return pieceSVG(t, c, extra);
  return h('img', { class: `cp3 ${c} ${extra}`, src: shot.url, alt: '', draggable: 'false', style: { '--ay': shot.at[1] } });
}
const pieceEl = (p) => pieceArt(p.t, p.c);

export function mount(root) {
  let state, history, keys, selected, over, lastMove, gen = 0, cpuBusy = false;
  ensureDefs();
  const ui = gameShell(root, { title: 'チェス', rules: RULES, onUndo: undo, onRestart: restart, cpu: { id: 'chess', onChange: restart } });
  const cpuOn = () => ui.cpu.on;
  const top = playerPanel({ name: '黒', mark: pieceArt('k', 'b'), flip: settings.faceToFace });
  const bottom = playerPanel({ name: '白', mark: pieceArt('k', 'w') });
  const panels = { w: bottom, b: top };
  const board = h('div', { class: `chess-board ${settings.faceToFace ? 'f2f' : ''}` });
  const frame = h('div', { class: 'chess-frame' }, board);
  const wrap = h('div', { class: 'board-wrap' }, frame);
  ui.main.append(top.el, wrap, bottom.el);
  const unfit = fitBoard(ui.main, wrap, frame);

  const squares = [];
  for (let i = 0; i < 64; i++) {
    const r = i >> 3, c = i & 7;
    const sq = h('button', { class: `sq ${(r + c) % 2 ? 'dark' : 'light'}`, 'aria-label': C.squareName(i), onclick: () => tap(i) });
    // 寄木: マスごとに木目の別の場所を切り出す
    sq.style.backgroundPosition = `${((c * 3 + r * 5) % 8) * 14.28}% ${((r * 3 + c * 7) % 8) * 14.28}%`;
    squares.push(sq);
    board.append(sq);
  }

  function restart() {
    gen++; cpuBusy = false;
    // CPU と遊ぶときは、上の黒が CPU（名札も駒も逆さにしない）
    top.setFlip(settings.faceToFace && !cpuOn());
    board.classList.toggle('f2f', settings.faceToFace && !cpuOn());
    top.el.querySelector('.plate-name').textContent = cpuOn() ? `黒 · CPU（${CPU_LEVELS[ui.cpu.level]}）` : '黒';
    state = C.initialState();
    history = [];
    keys = [C.positionKey(state)];
    selected = null;
    over = false;
    lastMove = null;
    render();
  }

  function undo() {
    if (!history.length) return;
    gen++; cpuBusy = false;
    ({ state, lastMove } = history.pop());
    keys.pop();
    while (cpuOn() && history.length && state.turn !== 'w') { ({ state, lastMove } = history.pop()); keys.pop(); } // 自分（白）の番まで戻す
    selected = null;
    over = false;
    render();
  }

  async function cpuTurn() {
    if (!cpuOn() || over || state.turn !== 'b') return;
    const g = ++gen; cpuBusy = true; render();
    await think(420);
    if (g !== gen) return;
    const m = chessMove(state, ui.cpu.level);
    cpuBusy = false;
    if (m) play(m);
  }

  async function tap(i) {
    if (over || cpuBusy || (cpuOn() && state.turn === 'b')) return;
    const legal = C.legalMoves(state);
    if (selected !== null) {
      const candidates = legal.filter((m) => m.from === selected && m.to === i);
      if (candidates.length) {
        let move = candidates[0];
        if (candidates.length > 1) {
          const promo = await askPromotion(state.turn);
          if (!promo) return;
          move = candidates.find((m) => m.promo === promo);
        }
        play(move);
        return;
      }
    }
    const p = state.board[i];
    if (p && p.c === state.turn && selected !== i) {
      selected = i;
      sfx('tap');
    } else {
      selected = null;
    }
    render();
  }

  function askPromotion(color) {
    return modal({
      title: '昇格する駒を選んでください',
      flip: settings.faceToFace && color === 'b',
      buttons: ['q', 'r', 'b', 'n'].map((t) => ({ label: pieceArt(t, color), value: t })),
      className: 'promo-modal',
    });
  }

  function play(move) {
    history.push({ state, lastMove });
    const next = C.makeMove(state, move);
    state = next;
    keys.push(C.positionKey(state));
    lastMove = move;
    selected = null;
    const status = C.gameStatus(state, keys);
    sfx(next.captured ? 'capture' : 'place');
    if (status.over) {
      over = true;
      render(status);
      setTimeout(async () => {
        sfx('win');
        const again = await showResult({
          title: status.winner ? `${NAMES[status.winner]}の勝ち` : '引き分け',
          mark: status.winner ? pieceArt('k', status.winner) : null,
          detail: `${status.reason}・${Math.ceil(history.length / 2)}手`,
          flip: settings.faceToFace && status.winner === 'b',
        });
        if (again === 'again') restart();
      }, 600);
      return;
    }
    if (status.check) setTimeout(() => sfx('check'), 120);
    render(status);
    setTimeout(cpuTurn, 300);
  }

  function render(status = C.gameStatus(state, keys)) {
    const targets = new Map();
    if (selected !== null) {
      for (const m of C.legalMoves(state)) if (m.from === selected) targets.set(m.to, m);
    }
    const checkSq = C.inCheck(state) ? C.kingSquare(state.board, state.turn) : -1;
    state.board.forEach((p, i) => {
      const sq = squares[i];
      const r = i >> 3, c = i & 7;
      sq.replaceChildren();
      if (c === 0) sq.append(h('span', { class: 'coord rank' }, 8 - r));
      if (r === 7) sq.append(h('span', { class: 'coord file' }, FILES[c]));
      if (p) sq.append(pieceEl(p));
      if (targets.has(i)) sq.append(h('span', { class: p || targets.get(i).ep ? 'target capture' : 'target' }));
      sq.classList.toggle('selected', i === selected);
      sq.classList.toggle('last', !!lastMove && (i === lastMove.from || i === lastMove.to));
      sq.classList.toggle('check', i === checkSq);
    });

    // 取った駒と駒得
    const captures = [...history.map((e) => e.state.captured), state.captured].filter(Boolean);
    const order = 'qrbnp';
    for (const color of ['w', 'b']) {
      const enemy = C.other(color);
      const taken = captures.filter((p) => p.c === enemy).sort((a, b) => order.indexOf(a.t) - order.indexOf(b.t))
        .map((p) => pieceArt(p.t, enemy, 'tiny'));
      const adv = material(color) - material(enemy);
      panels[color].setInfo(h('span', { class: 'captured' }, taken, adv > 0 ? h('small', {}, ` +${adv}`) : null));
      const active = !over && state.turn === color;
      panels[color].setActive(active);
      const isCpu = cpuOn() && color === 'b';
      panels[color].setStatus(active ? (status.check ? 'チェック！' : isCpu ? '考え中…' : 'あなたの番') : '');
      panels[color].el.classList.toggle('thinking', active && isCpu);
    }
    ui.setUndoEnabled(history.length > 0);
  }

  function material(color) {
    return state.board.reduce((a, p) => a + (p && p.c === color ? VALUE[p.t] : 0), 0);
  }

  restart();
  return () => unfit();
}
