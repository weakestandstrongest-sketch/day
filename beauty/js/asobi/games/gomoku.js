import { h, s, gameShell, playerPanel, modal, showResult, toast, sfx, settings, fitBoard, stone, loadPref, savePref, confirm, ensureDefs, paperTexture } from '../ui.js';
import * as G from './gomoku-logic.js';
import { real } from '../real/index.js';

const RULES = `
<p>縦・横・ななめのどれかに、自分の石を5つ並べたら勝ちです。</p>
<ul>
<li>黒が先手です。交点をタップすると仮置きになり、<b>もう一度同じ場所をタップすると確定</b>します。</li>
<li><b>禁じ手なし</b>: 5つ以上並べれば勝ち。</li>
<li><b>禁じ手あり</b>: 先手が有利すぎないよう、黒だけ「三三」「四四」「長連 (6つ以上)」になる場所に置けません。黒は5つちょうどで勝ち、白は5つ以上で勝ちです。禁じ手の場所には × が表示されます。</li>
</ul>`;

const RULE_LABEL = { free: '禁じ手なし', renju: '禁じ手あり' };
const N = G.SIZE;
const GAP = 10;
const pos = (i) => GAP + i * GAP;
const STARS = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];

export function mount(root) {
  let rule = loadPref('gomoku.rule', 'free');
  let state, history, preview, over;
  const ui = gameShell(root, { title: '五目並べ', rules: RULES, onUndo: undo, onRestart: restart });
  const top = playerPanel({ name: '白', mark: stone('white'), flip: settings.faceToFace });
  const bottom = playerPanel({ name: '黒', mark: stone('black') });
  const panels = { [G.BLACK]: bottom, [G.WHITE]: top };

  ensureDefs();
  const size = pos(N - 1) + GAP;
  const svg = s('svg', { class: 'gomoku-board', viewBox: `0 0 ${size} ${size}` });
  svg.append(s('image', { href: real.tex('kaya') || paperTexture({ seed: 11 }), x: 0, y: 0, width: size, height: size, preserveAspectRatio: 'none' }));
  const grid = s('g', { class: 'gk-grid' });
  for (let i = 0; i < N; i++) {
    grid.append(s('line', { x1: pos(0), y1: pos(i), x2: pos(N - 1), y2: pos(i) }));
    grid.append(s('line', { x1: pos(i), y1: pos(0), x2: pos(i), y2: pos(N - 1) }));
  }
  for (const [r, c] of STARS) grid.append(s('circle', { cx: pos(c), cy: pos(r), r: 1.1, class: 'gk-star' }));
  const layer = s('g');
  svg.append(grid, layer);
  svg.addEventListener('click', onTap);

  const wrap = h('div', { class: 'board-wrap' }, svg);
  const ruleBtn = h('button', { class: 'chip', onclick: chooseRule });
  const hint = h('span', { class: 'hint-line' });
  ui.main.append(top.el, wrap, h('div', { class: 'sub-bar' }, ruleBtn, hint), bottom.el);
  const unfit = fitBoard(ui.main, wrap, svg);

  function restart() {
    state = G.initialState();
    history = [];
    preview = null;
    over = false;
    render();
  }

  async function chooseRule() {
    const choice = await modal({
      title: 'ルールを選ぶ',
      body: h('p', {}, '禁じ手ありにすると、黒 (先手) は三三・四四・長連になる場所に置けません。'),
      buttons: [
        { label: '禁じ手なし', value: 'free', primary: rule === 'free' },
        { label: '禁じ手あり', value: 'renju', primary: rule === 'renju' },
      ],
    });
    if (!choice || choice === rule) return;
    if (state.moves.length && !over && !(await confirm('ルールを変えると最初からになります。よろしいですか？'))) return;
    rule = choice;
    savePref('gomoku.rule', rule);
    restart();
  }

  function undo() {
    if (!history.length) return;
    state = history.pop();
    preview = null;
    over = false;
    render();
  }

  function onTap(e) {
    if (over) return;
    const rect = svg.getBoundingClientRect();
    const scale = size / rect.width;
    const c = Math.round(((e.clientX - rect.left) * scale - GAP) / GAP);
    const r = Math.round(((e.clientY - rect.top) * scale - GAP) / GAP);
    if (r < 0 || r >= N || c < 0 || c >= N) return;
    const idx = r * N + c;
    if (state.board[idx] !== 0) return;
    if (preview !== idx) {
      if (rule === 'renju' && state.turn === G.BLACK) {
        const reason = G.forbiddenReason(state.board, idx);
        if (reason) { sfx('error'); toast(`禁じ手（${reason}）です`); return; }
      }
      preview = idx;
      sfx('tap');
      render();
      return;
    }
    const next = G.play(state, idx, rule);
    if (next.error) { sfx('error'); toast(next.error); return; }
    history.push(state);
    state = next;
    preview = null;
    sfx('place');
    if (next.winner || next.draw) {
      over = true;
      render();
      setTimeout(async () => {
        sfx('win');
        const color = next.winner === G.BLACK ? 'black' : 'white';
        const again = await showResult({
          title: next.winner ? `${next.winner === G.BLACK ? '黒' : '白'}の勝ち` : '引き分け',
          mark: next.winner ? stone(color, 'xl') : null,
          detail: next.winner ? `${state.moves.length}手で五目がそろいました` : '盤面が埋まりました',
          flip: settings.faceToFace && next.winner === G.WHITE,
        });
        if (again === 'again') restart();
      }, 650);
      return;
    }
    render();
  }

  function render() {
    layer.replaceChildren();
    const last = state.moves[state.moves.length - 1];
    state.board.forEach((v, i) => {
      if (!v) return;
      const cx = pos(i % N), cy = pos(Math.floor(i / N));
      const art = real.stone(v === G.BLACK ? 'black' : 'white');
      if (art) {
        // 撮った石 (影ごと)。石の直径 9 に対して、画像は 1.44 倍
        layer.append(s('image', { href: art, x: cx - 6.48, y: cy - 6.48, width: 12.96, height: 12.96, class: `gk-stone3 ${i === last ? 'new' : ''}` }));
        return;
      }
      layer.append(s('circle', { cx: cx + 0.5, cy: cy + 0.8, r: 4.5, class: 'gk-shadow' }));
      layer.append(s('circle', { cx, cy, r: 4.5, class: `gk-stone ${v === G.BLACK ? 'black' : 'white'} ${i === last ? 'new' : ''}` }));
    });
    if (last !== undefined) {
      layer.append(s('circle', { cx: pos(last % N), cy: pos(Math.floor(last / N)), r: 1.3, class: `gk-last ${state.board[last] === G.BLACK ? 'on-black' : 'on-white'}` }));
    }
    if (state.line) {
      const [a, b] = [state.line[0], state.line[state.line.length - 1]];
      layer.append(s('line', {
        x1: pos(a % N), y1: pos(Math.floor(a / N)), x2: pos(b % N), y2: pos(Math.floor(b / N)), class: 'gk-winline',
      }));
    }
    if (!over && rule === 'renju' && state.turn === G.BLACK && state.moves.length >= 4) {
      for (let i = 0; i < state.board.length; i++) {
        if (state.board[i] || !G.forbiddenReason(state.board, i)) continue;
        const cx = pos(i % N), cy = pos(Math.floor(i / N));
        layer.append(s('path', { d: `M${cx - 2.4} ${cy - 2.4}l4.8 4.8M${cx + 2.4} ${cy - 2.4}l-4.8 4.8`, class: 'gk-forbidden' }));
      }
    }
    if (preview !== null) {
      const art = real.stone(state.turn === G.BLACK ? 'black' : 'white');
      const px = pos(preview % N), py = pos(Math.floor(preview / N));
      layer.append(art
        ? s('image', { href: art, x: px - 6.48, y: py - 6.48, width: 12.96, height: 12.96, class: 'gk-stone3 preview' })
        : s('circle', { cx: px, cy: py, r: 4.5, class: `gk-stone preview ${state.turn === G.BLACK ? 'black' : 'white'}` }));
    }
    ruleBtn.textContent = `ルール: ${RULE_LABEL[rule]}`;
    hint.textContent = over ? `${state.moves.length}手で終局`
      : preview !== null ? 'もう一度タップで確定' : `${state.moves.length + 1}手目・交点をタップして仮置き`;
    for (const color of [G.BLACK, G.WHITE]) {
      const active = !over && state.turn === color;
      panels[color].setActive(active);
      panels[color].setStatus(active ? 'あなたの番' : '');
    }
    ui.setUndoEnabled(history.length > 0);
  }

  restart();
  return () => unfit();
}
