import { h, gameShell, sfx, settings, loadPref, savePref } from '../ui.js';
import { judge, isValidCode } from './hitblow-logic.js';
import { real } from '../real/index.js';

const RULES = `
<p>おたがいに4つの色の並びを秘密で決め、相手の並びを先に当てたほうが勝ちです。</p>
<ul>
<li>最初に一人ずつ、相手に見られないように秘密の並びを決めます。</li>
<li>交互に相手の並びを予想します。<b>ヒット</b> = 色も場所も合っている数、<b>ブロー</b> = 色は合っているが場所が違う数。</li>
<li>先手が当てても、後手にも同じ回数のチャンスがあります。同じ回数で両方当てたら引き分け。</li>
<li>どちらも ${10} 回で当てられなかったら引き分けです。</li>
</ul>`;

const COLORS = [
  { name: '赤', hex: '#c9384a' }, { name: '青', hex: '#3f74c4' }, { name: '緑', hex: '#5aa77a' },
  { name: '黄', hex: '#e9b23a' }, { name: '紫', hex: '#7d5aa8' }, { name: '橙', hex: '#dc6b3a' },
  { name: 'ピンク', hex: '#e98ea0' }, { name: '水色', hex: '#3aa9b6' },
];
const LENGTH = 4;
const MAX_TURNS = 10;
const PLAYER = ['プレイヤー1', 'プレイヤー2'];

// 3D で撮ったガラス玉があれば、それを地に敷く
const pegStyle = (hex) => {
  const art = real.peg(hex);
  return art ? { '--c': hex, '--art': `url(${art})` } : { '--c': hex };
};
const peg = (color, extra = '') => h('span', {
  class: `peg ${color == null ? 'empty' : ''} ${real.peg(COLORS[0].hex) ? 'peg3' : ''} ${extra}`,
  style: color == null ? null : pegStyle(COLORS[color].hex),
  'aria-label': color == null ? '空' : COLORS[color].name,
});

export function mount(root) {
  let opts = loadPref('hitblow.opts', { colors: 6, duplicates: false });
  let secrets, guesses, solvedAt, turn, input, busy;
  const ui = gameShell(root, { title: 'ヒット&ブロー', rules: RULES, onRestart: restart });
  const body = h('div', { class: 'hb-body' });
  ui.main.append(body);

  const config = () => ({ length: LENGTH, colors: opts.colors, duplicates: opts.duplicates });
  const flipFor = (p) => settings.faceToFace && p === 1;

  function restart() {
    secrets = [null, null];
    guesses = [[], []];
    solvedAt = [null, null];
    turn = 0;
    busy = false;
    showSetup();
  }

  function screen(player, ...children) {
    body.className = `hb-body ${player !== null && flipFor(player) ? 'flip' : ''}`;
    body.replaceChildren(...children);
  }

  function showSetup() {
    const seg = (label, key, values) => h('div', { class: 'hb-option' },
      h('span', {}, label),
      h('div', { class: 'segmented' }, values.map(([v, text]) => h('button', {
        class: opts[key] === v ? 'on' : '',
        onclick: () => { opts = { ...opts, [key]: v }; savePref('hitblow.opts', opts); sfx('tap'); showSetup(); },
      }, text))));
    screen(null, h('div', { class: 'hb-card' },
      h('h2', {}, 'ゲームの設定'),
      seg('色の数', 'colors', [[6, '6色'], [8, '8色']]),
      seg('同じ色', 'duplicates', [[false, '使わない'], [true, '使ってよい']]),
      h('p', { class: 'muted' }, `4つの色の並びを当てます。最大${MAX_TURNS}回まで。`),
      h('button', { class: 'btn primary big', onclick: () => handover(0, () => enterSecret(0), '秘密の並びを決めます') }, 'はじめる')));
  }

  function handover(player, next, message) {
    screen(player, h('div', { class: 'hb-card handover' },
      h('div', { class: `turn-badge big p${player + 1}` }, PLAYER[player]),
      h('p', {}, message),
      h('p', { class: 'muted' }, player === 0 && !secrets[0] ? 'プレイヤー2は画面を見ないでください。' : `${PLAYER[player]}に渡してください。`),
      h('button', { class: 'btn primary big', onclick: () => { sfx('tap'); next(); } }, '準備OK')));
  }

  // 色を並べる入力欄 (秘密の設定と予想で共用)
  function codeInput(onSubmit, submitLabel) {
    input = [];
    const slots = h('div', { class: 'peg-row input' });
    const palette = h('div', { class: 'palette' });
    const submit = h('button', { class: 'btn primary big', onclick: () => { if (isValidCode(input, config())) onSubmit(input.slice()); } }, submitLabel);
    const refresh = () => {
      slots.replaceChildren(...Array.from({ length: LENGTH }, (_, i) => {
        const el = peg(input[i], 'slot');
        el.addEventListener('click', () => { if (input[i] != null) { input.splice(i, 1); sfx('tap'); refresh(); } });
        return el;
      }));
      palette.replaceChildren(...COLORS.slice(0, opts.colors).map((c, ci) => h('button', {
        class: `palette-btn ${real.peg(c.hex) ? 'peg3' : ''}`,
        style: pegStyle(c.hex),
        'aria-label': c.name,
        disabled: input.length >= LENGTH || (!opts.duplicates && input.includes(ci)),
        onclick: () => { if (input.length < LENGTH) { input.push(ci); sfx('tap'); refresh(); } },
      })));
      submit.disabled = !isValidCode(input, config());
    };
    refresh();
    return h('div', { class: 'code-input' }, slots, h('p', { class: 'muted small' }, '色をタップして並べる / 並べた色をタップで消す'), palette, submit);
  }

  function enterSecret(player) {
    screen(player, h('div', { class: 'hb-card' },
      h('div', { class: `turn-badge p${player + 1}` }, PLAYER[player]),
      h('h2', {}, '秘密の並びを決めてください'),
      h('p', { class: 'muted' }, opts.duplicates ? '同じ色を何度使ってもOK' : '同じ色は1回ずつ'),
      codeInput((code) => {
        secrets[player] = code;
        sfx('place');
        if (player === 0) handover(1, () => enterSecret(1), '秘密の並びを決めます');
        else handover(0, showTurn, '予想スタート！先にプレイヤー1から');
      }, '決定')));
  }

  function history(player) {
    const list = guesses[player];
    if (!list.length) return h('p', { class: 'muted hb-empty' }, 'まだ予想していません');
    return h('ol', { class: 'hb-history' }, list.map((g, i) => h('li', {},
      h('span', { class: 'hb-num' }, i + 1),
      h('span', { class: 'peg-row' }, g.code.map((c) => peg(c))),
      h('span', { class: 'hb-result', 'aria-label': `${g.hit}ヒット ${g.blow}ブロー` },
        h('span', { class: 'keys' }, Array.from({ length: LENGTH }, (_, k) =>
          h('i', { class: k < g.hit ? 'k-hit' : k < g.hit + g.blow ? 'k-blow' : '' }))),
        h('span', { class: 'hb-nums' }, h('b', { class: 'hit' }, g.hit), 'H ', h('b', { class: 'blow' }, g.blow), 'B')))));
  }

  function showTurn() {
    const opponent = 1 - turn;
    const best = guesses[opponent].reduce((m, g) => Math.max(m, g.hit), 0);
    const list = history(turn);
    screen(turn, h('div', { class: 'hb-play' },
      h('div', { class: 'hb-status' },
        h('span', { class: `turn-badge p${turn + 1}` }, PLAYER[turn]),
        h('span', {}, ` ${guesses[turn].length + 1}回目の予想`),
        h('small', { class: 'muted' }, `相手: ${guesses[opponent].length}回 / 最高${best}ヒット`)),
      h('div', { class: 'hb-history-wrap' }, list),
      codeInput(submitGuess, '予想する')));
    const wrap = body.querySelector('.hb-history-wrap');
    wrap.scrollTop = wrap.scrollHeight;
  }

  function submitGuess(code) {
    if (busy) return;
    busy = true;
    const result = judge(secrets[1 - turn], code);
    guesses[turn].push({ code, ...result });
    if (result.hit === LENGTH && solvedAt[turn] === null) solvedAt[turn] = guesses[turn].length;
    sfx(result.hit === LENGTH ? 'win' : 'place');
    showTurn();
    body.querySelector('.code-input').classList.add('locked');
    const flash = h('div', { class: 'hb-flash' },
      result.hit === LENGTH ? h('b', {}, '正解！') : [h('b', { class: 'hit' }, `${result.hit} ヒット`), h('b', { class: 'blow' }, `${result.blow} ブロー`)]);
    body.append(flash);
    setTimeout(() => {
      busy = false;
      const roundDone = turn === 1;
      const someoneSolved = solvedAt[0] !== null || solvedAt[1] !== null;
      if (roundDone && (someoneSolved || guesses[1].length >= MAX_TURNS)) { finish(); return; }
      turn = 1 - turn;
      showTurn();
    }, 1400);
  }

  function finish() {
    const [a, b] = solvedAt;
    const winner = a !== null && b === null ? 0 : b !== null && a === null ? 1 : null;
    screen(null, h('div', { class: 'hb-card' },
      h('h2', {}, winner === null ? '引き分け' : `${PLAYER[winner]}の勝ち`),
      [0, 1].map((p) => h('div', { class: 'hb-reveal' },
        h('span', { class: `turn-badge p${p + 1}` }, `${PLAYER[p]}の秘密`),
        h('span', { class: 'peg-row' }, secrets[p].map((c) => peg(c))),
        h('small', { class: 'muted' }, solvedAt[1 - p] ? `${solvedAt[1 - p]}回で当てられた` : '当てられなかった'))),
      h('button', { class: 'btn primary big', onclick: restart }, 'もう一度')));
    sfx('win');
  }

  restart();
}
