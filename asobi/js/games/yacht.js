import { h, gameShell, showResult, toast, sfx, settings } from '../ui.js';
import * as Y from './yacht-logic.js';

const RULES = `
<p>5つのサイコロを振って役を作り、得点表を埋めていきます。12ラウンドで合計点の多いほうが勝ち。</p>
<ul>
<li>1回の番でサイコロは<b>3回まで</b>振れます。サイコロをタップすると「キープ」になり、次に振るときに残せます。</li>
<li>振り終えたら、得点表の自分の列の空いている欄をタップして選び、もう一度タップ (または下のボタン) で記入します。0点の欄に記入することもできます。</li>
<li>エース〜シックスの合計が<b>63点以上</b>なら、ボーナス<b>35点</b>。</li>
</ul>
<table class="mini-table">
<tr><td>チョイス</td><td>全部の目の合計</td></tr>
<tr><td>フォーダイス</td><td>同じ目4つ以上 → 全部の目の合計</td></tr>
<tr><td>フルハウス</td><td>同じ目3つ＋2つ → 全部の目の合計</td></tr>
<tr><td>S.ストレート</td><td>4つ連続 → 15点</td></tr>
<tr><td>B.ストレート</td><td>5つ連続 → 30点</td></tr>
<tr><td>ヨット</td><td>5つ全部同じ → 50点</td></tr>
</table>`;

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const PLAYER = ['プレイヤー1', 'プレイヤー2'];

function dieFace(el, value) {
  el.replaceChildren(...Array.from({ length: 9 }, (_, i) =>
    h('span', { class: `pip ${value && PIPS[value].includes(i) ? 'on' : ''}` })));
  el.dataset.value = value || '';
}

export function mount(root) {
  let sheets, turn, dice, held, rollsLeft, selectedCat, rolling, over;
  const ui = gameShell(root, { title: 'ヨット', rules: RULES, onRestart: restart });

  const table = h('table', { class: 'yacht-sheet' });
  const head = h('tr', {}, h('th', { class: 'sheet-title' }, 'SCORE'), PLAYER.map((name, p) => h('th', { class: `p${p + 1}` }, h('span', { class: 'col-chip' }, `${p + 1}P`))));
  const cellEls = {};
  const rows = [head];
  const addCatRow = (cat) => {
    const tds = [0, 1].map((p) => h('td', { class: `score p${p + 1}`, onclick: () => tapCell(p, cat.id) }));
    cellEls[cat.id] = tds;
    rows.push(h('tr', {}, h('th', {}, h('span', { class: 'cat-name' }, cat.name), h('small', {}, cat.desc)), tds));
  };
  Y.CATEGORIES.filter((c) => c.face).forEach(addCatRow);
  const subtotalTds = [0, 1].map(() => h('td', { class: 'sum' }));
  const bonusTds = [0, 1].map(() => h('td', { class: 'sum' }));
  rows.push(h('tr', { class: 'sum-row' }, h('th', {}, '小計', h('small', {}, '63点で+35')), subtotalTds));
  rows.push(h('tr', { class: 'sum-row' }, h('th', {}, 'ボーナス'), bonusTds));
  Y.CATEGORIES.filter((c) => !c.face).forEach(addCatRow);
  const totalTds = [0, 1].map(() => h('td', { class: 'total' }));
  rows.push(h('tr', { class: 'total-row' }, h('th', {}, '合計'), totalTds));
  table.append(...rows);

  const diceEls = Array.from({ length: 5 }, (_, i) => h('button', { class: 'die', onclick: () => toggleHold(i) }));
  const status = h('div', { class: 'yacht-status' });
  const action = h('button', { class: 'btn primary big', onclick: onAction });
  const body = h('div', { class: 'yacht-body' },
    h('div', { class: 'sheet-wrap' }, table),
    status,
    h('div', { class: 'dice-tray' }, h('div', { class: 'dice-row' }, diceEls)),
    action);
  ui.main.append(body);

  function restart() {
    sheets = [{}, {}];
    turn = 0;
    over = false;
    startTurn();
  }

  function startTurn() {
    dice = [0, 0, 0, 0, 0];
    held = [false, false, false, false, false];
    rollsLeft = 3;
    selectedCat = null;
    rolling = false;
    body.classList.toggle('flip', settings.faceToFace && turn === 1);
    render();
  }

  function toggleHold(i) {
    if (rolling || rollsLeft === 3 || rollsLeft === 0 || over) return;
    held[i] = !held[i];
    sfx('tap');
    render();
  }

  function onAction() {
    if (over) return;
    if (selectedCat) { commit(selectedCat); return; }
    roll();
  }

  function roll() {
    if (rolling || rollsLeft === 0) return;
    if (held.every(Boolean)) { toast('全部キープしています'); return; }
    rolling = true;
    rollsLeft--;
    selectedCat = null;
    sfx('roll');
    const final = dice.map((d, i) => (held[i] ? d : 1 + Math.floor(Math.random() * 6)));
    let frames = 0;
    diceEls.forEach((el, i) => el.classList.toggle('rolling', !held[i]));
    const timer = setInterval(() => {
      frames++;
      diceEls.forEach((el, i) => { if (!held[i]) dieFace(el, 1 + Math.floor(Math.random() * 6)); });
      if (frames >= 7) {
        clearInterval(timer);
        dice = final;
        rolling = false;
        diceEls.forEach((el) => el.classList.remove('rolling'));
        render();
      }
    }, 60);
    render();
  }

  function tapCell(player, catId) {
    if (over || rolling) return;
    if (player !== turn || catId in sheets[turn]) return;
    if (rollsLeft === 3) { toast('まずサイコロを振ってください', { flip: body.classList.contains('flip') }); return; }
    if (selectedCat === catId) { commit(catId); return; }
    selectedCat = catId;
    sfx('tap');
    render();
  }

  function commit(catId) {
    sheets[turn][catId] = Y.score(catId, dice);
    sfx('place');
    selectedCat = null;
    if (Y.isComplete(sheets[0]) && Y.isComplete(sheets[1])) {
      over = true;
      render();
      setTimeout(finish, 400);
      return;
    }
    turn = 1 - turn;
    startTurn();
  }

  async function finish() {
    const [a, b] = sheets.map((sh) => Y.totals(sh).total);
    sfx('win');
    body.classList.remove('flip');
    const winner = a === b ? null : a > b ? 0 : 1;
    const again = await showResult({
      title: winner === null ? '引き分け' : `${PLAYER[winner]}の勝ち`,
      accent: winner === null ? undefined : `var(--p${winner + 1})`,
      detail: h('div', { class: 'score-line' },
        h('span', { class: 'p1' }, h('small', {}, '1P'), h('b', {}, a)),
        h('span', { class: 'vs' }, '−'),
        h('span', { class: 'p2' }, h('b', {}, b), h('small', {}, '2P'))),
      flip: settings.faceToFace && winner === 1,
    });
    if (again === 'again') restart();
  }

  function render() {
    const canScore = !over && rollsLeft < 3 && !rolling;
    for (const cat of Y.CATEGORIES) {
      cellEls[cat.id].forEach((td, p) => {
        const filled = cat.id in sheets[p];
        const potential = p === turn && !filled && canScore;
        td.textContent = filled ? sheets[p][cat.id] : potential ? Y.score(cat.id, dice) : '';
        td.className = `score p${p + 1} ${filled ? 'filled' : ''} ${potential ? 'potential' : ''} `
          + `${potential && Y.score(cat.id, dice) === 0 ? 'zero' : ''} ${p === turn && selectedCat === cat.id ? 'selected' : ''}`;
      });
    }
    [0, 1].forEach((p) => {
      const t = Y.totals(sheets[p]);
      subtotalTds[p].textContent = `${t.upper}/${Y.BONUS_THRESHOLD}`;
      bonusTds[p].textContent = t.bonus ? `+${t.bonus}` : '';
      totalTds[p].textContent = t.total;
    });
    table.dataset.turn = turn;
    diceEls.forEach((el, i) => {
      if (!rolling || held[i]) dieFace(el, dice[i]);
      el.classList.toggle('held', held[i]);
      el.disabled = over || rollsLeft === 3 || rollsLeft === 0;
    });
    const round = Math.min(12, Object.keys(sheets[turn]).length + 1);
    status.replaceChildren(
      h('span', { class: `turn-badge p${turn + 1}` }, PLAYER[turn]),
      h('span', { class: 'round' }, `ラウンド ${round}/12`),
      h('span', { class: 'rolls', 'aria-label': `残り${rollsLeft}回` },
        [0, 1, 2].map((i) => h('i', { class: i < rollsLeft ? 'on' : '' }))));
    if (over) {
      action.textContent = 'ゲーム終了';
      action.disabled = true;
    } else if (selectedCat) {
      const cat = Y.CATEGORIES.find((c) => c.id === selectedCat);
      action.textContent = `「${cat.name}」に ${Y.score(selectedCat, dice)}点 を記入`;
      action.disabled = rolling;
      action.classList.add('commit');
    } else {
      action.classList.remove('commit');
      action.disabled = rolling || rollsLeft === 0;
      action.textContent = rollsLeft === 0 ? '記入する欄を選んでください'
        : rollsLeft === 3 ? 'サイコロを振る' : `もう一度振る（残り${rollsLeft}回）`;
    }
  }

  restart();
}
