import { h, s, gameShell, playerPanel, modal, showResult, sfx, settings, fitBoard, ensureDefs, paperTexture } from '../ui.js';
import * as S from './minishogi-logic.js';
import { real } from '../real/index.js';

const RULES = `
<p>5×5マスの盤で遊ぶ小さな将棋です。相手の玉を詰ませたら勝ち。先手 (下側) から指します。</p>
<ul>
<li>駒をタップすると動ける場所が表示されます。取った駒は「持ち駒」として、自分の番に空いているマスへ打てます。</li>
<li><b>敵陣は相手側の一番奥の1段だけ</b>です。そこへ入る・そこから出るときに成れます。歩は一番奥に着いたら必ず成ります。</li>
<li>二歩・打ち歩詰め・一番奥の段への歩打ちは禁止です。</li>
<li>同じ局面が4回現れたら千日手。<b>5五将棋では先手の負け</b>です (連続王手の場合は王手をかけた側の負け)。</li>
</ul>
<p>初期配置 (先手): 玉・金・銀・角・飛と、玉の前に歩。</p>`;

const NAMES = ['先手', '後手'];
const NAMES_HAND = { R: '飛', B: '角', G: '金', S: '銀', P: '歩' };

// 駒の大きさは種類で少し変える (玉が一番大きく、歩が一番小さい)
const KOMA_SCALE = { K: 1, R: 0.97, B: 0.97, G: 0.94, S: 0.94, P: 0.88 };

function komaEl(piece, extra = '') {
  const k = KOMA_SCALE[piece.t];
  const art = real.koma(piece);
  if (art) {
    return h('img', { class: `koma koma3 ${piece.o ? 'gote' : 'sente'} ${piece.p ? 'promoted' : ''} ${extra}`, src: art, alt: S.pieceLabel(piece), draggable: 'false', style: { '--k': k } });
  }
  const svg = s('svg', {
    viewBox: '0 0 100 110',
    class: `koma ${piece.o ? 'gote' : 'sente'} ${piece.p ? 'promoted' : ''} ${extra}`,
    style: { '--k': k },
  });
  svg.append(
    s('path', { class: 'koma-edge', d: 'M50 3 L83 15 L96 107 H4 L17 15 Z' }),
    s('path', { class: 'koma-face', d: 'M50 8 L79 19 L91 102 H9 L21 19 Z' }),
    s('text', { x: 50, y: 64, class: 'koma-text', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, S.pieceLabel(piece)));
  return svg;
}

export function mount(root) {
  let state, history, positions, selected, over, lastTo;
  ensureDefs();
  const ui = gameShell(root, { title: '5五将棋', rules: RULES, onUndo: undo, onRestart: restart });
  const top = playerPanel({ name: '後手', mark: komaEl({ o: 1, t: 'K', p: false }, 'avatar upright'), flip: settings.faceToFace });
  const bottom = playerPanel({ name: '先手', mark: komaEl({ o: 0, t: 'K', p: false }, 'avatar upright') });
  const panels = [bottom, top];
  const board = h('div', { class: 'shogi-board' });
  const frame = h('div', { class: 'shogi-frame', style: { backgroundImage: `url(${real.tex('kaya') || paperTexture({ base: '#e9dfc9', seed: 3 })})` } }, board);
  const wrap = h('div', { class: 'board-wrap' }, frame);
  ui.main.append(top.el, wrap, bottom.el);
  const unfit = fitBoard(ui.main, wrap, frame, 1.08);

  const cells = [];
  for (let i = 0; i < 25; i++) {
    const cell = h('button', { class: 'sh-cell', onclick: () => tapBoard(i) });
    cells.push(cell);
    board.append(cell);
  }

  function restart() {
    state = S.initialState();
    history = [];
    positions = [{ key: S.positionKey(state), check: false, turn: state.turn }];
    selected = null;
    over = false;
    lastTo = -1;
    render();
  }

  function undo() {
    if (!history.length) return;
    ({ state, lastTo } = history.pop());
    positions.pop();
    selected = null;
    over = false;
    render();
  }

  async function tapBoard(i) {
    if (over) return;
    if (selected) {
      const candidates = S.legalMoves(state).filter((m) => m.to === i
        && (selected.hand ? m.drop === selected.hand : m.from === selected.sq));
      if (candidates.length) {
        let move = candidates[0];
        if (candidates.length > 1) {
          const promote = await modal({
            title: '成りますか？',
            flip: settings.faceToFace && state.turn === 1,
            body: h('div', { class: 'promo-choice' },
              komaEl({ ...state.board[selected.sq], o: 0 }), '→', komaEl({ ...state.board[selected.sq], o: 0, p: true })),
            buttons: [{ label: '成らない', value: false }, { label: '成る', value: true, primary: true }],
            dismissible: false,
          });
          move = candidates.find((m) => m.promote === promote);
        }
        play(move);
        return;
      }
    }
    const p = state.board[i];
    if (p && p.o === state.turn && !(selected && selected.sq === i)) {
      selected = { sq: i };
      sfx('tap');
    } else {
      selected = null;
    }
    render();
  }

  function tapHand(owner, t) {
    if (over || owner !== state.turn) return;
    selected = selected && selected.hand === t ? null : { hand: t };
    sfx('tap');
    render();
  }

  function play(move) {
    history.push({ state, lastTo });
    state = S.makeMove(state, move);
    lastTo = move.to;
    selected = null;
    positions.push({ key: S.positionKey(state), check: S.inCheck(state), turn: state.turn });
    const status = S.gameStatus(state, positions);
    sfx(state.captured ? 'capture' : 'place');
    if (status.over) {
      over = true;
      render(status);
      setTimeout(async () => {
        sfx('win');
        const again = await showResult({
          title: `${NAMES[status.winner]}の勝ち`,
          mark: komaEl({ o: status.winner, t: 'K', p: false }, 'upright'),
          detail: `${status.reason}・${history.length}手`,
          flip: settings.faceToFace && status.winner === 1,
        });
        if (again === 'again') restart();
      }, 600);
      return;
    }
    if (status.check) setTimeout(() => sfx('check'), 120);
    render(status);
  }

  function render(status = S.gameStatus(state, positions)) {
    const targets = new Set();
    if (selected) {
      for (const m of S.legalMoves(state)) {
        if (selected.hand ? m.drop === selected.hand : m.from === selected.sq) targets.add(m.to);
      }
    }
    const checkSq = S.inCheck(state) ? S.kingSquare(state.board, state.turn) : -1;
    state.board.forEach((p, i) => {
      const cell = cells[i];
      cell.replaceChildren();
      if (p) cell.append(komaEl(p));
      if (targets.has(i)) cell.append(h('span', { class: p ? 'target capture' : 'target' }));
      cell.classList.toggle('selected', !!selected && selected.sq === i);
      cell.classList.toggle('last', i === lastTo);
      cell.classList.toggle('check', i === checkSq);
    });
    for (const owner of [0, 1]) {
      const hand = state.hands[owner];
      const items = S.HAND_ORDER.filter((t) => hand[t] > 0).map((t) => h('button', {
        class: `hand-piece ${selected && selected.hand === t && state.turn === owner ? 'selected' : ''}`,
        'aria-label': `持ち駒 ${NAMES_HAND[t]} ${hand[t]}枚`,
        onclick: () => tapHand(owner, t),
      }, komaEl({ o: owner, t, p: false }), hand[t] > 1 ? h('span', { class: 'hand-count' }, hand[t]) : null));
      panels[owner].setInfo(h('div', { class: 'hand' }, items.length ? items : h('span', { class: 'hand-empty' }, '持ち駒なし')));
      const active = !over && state.turn === owner;
      panels[owner].setActive(active);
      panels[owner].setStatus(active ? (status.check ? '王手！' : 'あなたの番') : '');
    }
    ui.setUndoEnabled(history.length > 0);
  }

  restart();
  return () => unfit();
}
