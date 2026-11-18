import { h, gameShell, playerPanel, showResult, toast, sfx, settings, fitBoard, stone, think, CPU_LEVELS } from '../ui.js';
import { reversiMove } from '../ai.js';
import * as R from './reversi-logic.js';

const RULES = `
<p>自分の石で相手の石をはさむと、はさんだ石が自分の色になります。</p>
<ul>
<li>黒が先手です。必ず相手の石をはさめるマスにしか置けません。</li>
<li>置ける場所がないときは自動でパスになります。</li>
<li>両者とも置けなくなったら終了。石の多いほうが勝ちです。</li>
</ul>`;

const NAMES = { [R.BLACK]: '黒', [R.WHITE]: '白' };
const CLS = { [R.BLACK]: 'black', [R.WHITE]: 'white' };

export function mount(root) {
  let state, history, gen = 0, cpuBusy = false;
  const ui = gameShell(root, { title: 'リバーシ', rules: RULES, onUndo: undo, onRestart: restart, cpu: { id: 'reversi', onChange: restart } });
  const top = playerPanel({ name: '白', mark: stone('white'), flip: settings.faceToFace });
  const cpuOn = () => ui.cpu.on;
  const bottom = playerPanel({ name: '黒', mark: stone('black') });
  const panels = { [R.BLACK]: bottom, [R.WHITE]: top };
  const grid = h('div', { class: 'rv-grid' });
  const board = h('div', { class: 'rv-frame' }, grid);
  const wrap = h('div', { class: 'board-wrap' }, board);
  ui.main.append(top.el, wrap, bottom.el);
  const unfit = fitBoard(ui.main, wrap, board);

  const cells = [];
  for (let i = 0; i < 64; i++) {
    const cell = h('button', { class: 'rv-cell', 'aria-label': `${'abcdefgh'[i % 8]}${Math.floor(i / 8) + 1}`, onclick: () => tap(i) },
      h('span', { class: 'rv-stone' }));
    cells.push(cell);
    grid.append(cell);
  }

  function restart() {
    gen++; cpuBusy = false;
    state = R.initialState();
    history = [];
    // CPU と遊ぶときは、上の白が CPU（名札は逆さにしない）
    top.setFlip(settings.faceToFace && !cpuOn());
    top.el.querySelector('.plate-name').textContent = cpuOn() ? `白 · CPU（${CPU_LEVELS[ui.cpu.level]}）` : '白';
    render();
  }

  function undo() {
    if (!history.length) return;
    gen++; cpuBusy = false;
    state = history.pop();
    // CPU と遊ぶときは、自分（黒）の番まで戻す
    while (cpuOn() && history.length && state.turn !== R.BLACK) state = history.pop();
    render();
  }

  function tap(i) {
    if (state.over || cpuBusy || (cpuOn() && state.turn === R.WHITE)) return;
    move(i);
  }

  async function cpuTurn() {
    if (!cpuOn() || state.over || state.turn !== R.WHITE) return;
    const g = ++gen; cpuBusy = true; render();
    await think();
    if (g !== gen) return;
    const m = reversiMove(state, ui.cpu.level);
    cpuBusy = false;
    if (m == null) return;
    move(m);
  }

  function move(i) {
    const next = R.play(state, i);
    if (!next) { sfx('error'); return; }
    history.push(state);
    state = next;
    sfx('place');
    setTimeout(() => sfx('flip'), 120);
    render(next.flipped, i);
    if (next.passed) {
      toast(`${NAMES[R.other(next.turn)]}は置ける場所がないのでパス`, { flip: settings.faceToFace && R.other(next.turn) === R.WHITE });
    }
    if (next.over) setTimeout(finish, 600);
    else setTimeout(cpuTurn, 380);
  }

  async function finish() {
    const { black, white } = R.count(state.board);
    sfx('win');
    const winner = black === white ? null : black > white ? R.BLACK : R.WHITE;
    const again = await showResult({
      title: winner ? `${NAMES[winner]}の勝ち` : '引き分け',
      mark: winner ? stone(CLS[winner], 'xl') : null,
      detail: h('div', { class: 'score-line' },
        h('span', {}, stone('black'), h('b', {}, black)),
        h('span', { class: 'vs' }, '−'),
        h('span', {}, h('b', {}, white), stone('white'))),
      flip: settings.faceToFace && winner === R.WHITE,
    });
    if (again === 'again') restart();
  }

  function render(flipped = [], placed = -1) {
    const legal = new Set(state.over ? [] : R.legalMoves(state.board, state.turn));
    const last = placed >= 0 ? placed : history.length ? diffPlaced(history[history.length - 1].board, state.board) : -1;
    state.board.forEach((v, i) => {
      const cell = cells[i];
      cell.classList.toggle('legal', legal.has(i));
      cell.classList.toggle('last', i === last);
      const st = cell.firstChild;
      st.className = `rv-stone ${v ? CLS[v] : ''} ${flipped.includes(i) ? 'flipping' : ''} ${i === placed ? 'dropping' : ''}`;
      if (flipped.includes(i)) st.style.animationDelay = `${60 + 25 * Math.hypot((i % 8) - (placed % 8), Math.floor(i / 8) - Math.floor(placed / 8))}ms`;
      else st.style.animationDelay = '';
    });
    grid.dataset.turn = CLS[state.turn];
    const { black, white } = R.count(state.board);
    bottom.setInfo(h('span', { class: 'count' }, h('b', {}, black), '枚'));
    top.setInfo(h('span', { class: 'count' }, h('b', {}, white), '枚'));
    for (const color of [R.BLACK, R.WHITE]) {
      const active = !state.over && state.turn === color;
      panels[color].setActive(active);
      const isCpu = cpuOn() && color === R.WHITE;
      panels[color].setStatus(active ? (isCpu ? '考え中…' : 'あなたの番') : '');
      panels[color].el.classList.toggle('thinking', active && isCpu);
    }
    ui.setUndoEnabled(history.length > 0);
  }

  restart();
  return () => unfit();
}

function diffPlaced(before, after) {
  for (let i = 0; i < before.length; i++) if (before[i] === 0 && after[i] !== 0) return i;
  return -1;
}
