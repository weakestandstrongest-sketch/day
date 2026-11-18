import { h, gameShell, showResult, toast, sfx, settings, think, CPU_LEVELS } from '../ui.js';
import { yachtHold, yachtCategory } from '../ai.js';
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
  let sheets, turn, dice, held, rollsLeft, selectedCat, rolling, over, gen = 0;
  const ui = gameShell(root, { title: 'ヨット', rules: RULES, onRestart: restart, cpu: { id: 'yacht', onChange: restart } });
  // CPU と遊ぶときは 2P が CPU
  const cpuOn = () => ui.cpu.on;
  const cpuTurnNow = () => cpuOn() && turn === 1;
  const nameOf = (p) => (cpuOn() && p === 1 ? `CPU（${CPU_LEVELS[ui.cpu.level]}）` : PLAYER[p]);

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
    gen++;
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
    body.classList.toggle('flip', settings.faceToFace && turn === 1 && !cpuOn());
    render();
    if (cpuTurnNow() && !over) cpuPlay(gen);
  }

  // CPU の番：振る → 残すサイコロを決める → もう一度振る… → 欄を選んで記入
  async function cpuPlay(g) {
    const alive = () => g === gen && cpuTurnNow() && !over;
    await think(300); if (!alive()) return;
    await roll(); if (!alive()) return;
    while (rollsLeft > 0) {
      await think(380); if (!alive()) return;
      const keep = yachtHold(sheets[1], dice, rollsLeft, ui.cpu.level);
      if (!keep) break;
      held = keep; sfx('tap'); render();
      await think(260); if (!alive()) return;
      if (held.every(Boolean)) break;
      await roll(); if (!alive()) return;
    }
    await think(300); if (!alive()) return;
    selectedCat = yachtCategory(sheets[1], dice, ui.cpu.level);
    sfx('tap'); render();
    await think(520); if (!alive()) return;
    commit(selectedCat);
  }

  function toggleHold(i) {
    if (rolling || rollsLeft === 3 || rollsLeft === 0 || over || cpuTurnNow()) return;
    held[i] = !held[i];
    sfx('tap');
    render();
  }

  function onAction() {
    if (over || cpuTurnNow()) return;
    if (selectedCat) { commit(selectedCat); return; }
    roll();
  }

  // 振り終わったら解決する（CPU が待てるように）
  function roll() {
    if (rolling || rollsLeft === 0) return Promise.resolve();
    if (held.every(Boolean)) { toast('全部キープしています'); return Promise.resolve(); }
    let done; const finished = new Promise((r) => { done = r; });
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
        setTimeout(done, 200);
      }
    }, 60);
    render();
    return finished;
  }

  function tapCell(player, catId) {
    if (over || rolling || cpuTurnNow()) return;
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
      title: winner === null ? '引き分け' : `${nameOf(winner)}の勝ち`,
      accent: winner === null ? undefined : `var(--p${winner + 1})`,
      detail: h('div', { class: 'score-line' },
        h('span', { class: 'p1' }, h('small', {}, '1P'), h('b', {}, a)),
        h('span', { class: 'vs' }, '−'),
        h('span', { class: 'p2' }, h('b', {}, b), h('small', {}, '2P'))),
      flip: settings.faceToFace && winner === 1 && !cpuOn(),
    });
    if (again === 'again') restart();
  }

  // 小計は、63点への輪で見せる
  function subRing(v) {
    const r = 12, c = 2 * Math.PI * r, f = Math.min(1, v / Y.BONUS_THRESHOLD);
    return `<svg class="sub-ring${f >= 1 ? ' done' : ''}" viewBox="0 0 30 30" role="img" aria-label="${v} / ${Y.BONUS_THRESHOLD}">`
      + `<circle class="bg" cx="15" cy="15" r="${r}"/>${f > 0 ? `<circle class="fg" cx="15" cy="15" r="${r}" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 15 15)"/>` : ''}`
      + `<text x="15" y="18.5" text-anchor="middle">${v}</text></svg>`;
  }
  // 表の左上：今の節気と候の名前（「候」の画面に出ているもの）
  function seasonTitle() {
    const sk = document.getElementById('sekki'), kn = document.getElementById('koName');
    const a = sk ? sk.textContent.trim().split(/\s+/)[0] : '', b = kn ? kn.textContent.trim() : '';
    head.firstChild.textContent = a || b ? [a, b].filter(Boolean).join(' · ') : 'SCORE';
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
      subtotalTds[p].innerHTML = subRing(t.upper);
      bonusTds[p].innerHTML = t.bonus ? `<span class="bonus-on">+${t.bonus}</span>` : '';
      totalTds[p].textContent = t.total;
    });
    seasonTitle();
    table.dataset.turn = turn;
    diceEls.forEach((el, i) => {
      if (!rolling || held[i]) dieFace(el, dice[i]);
      el.classList.toggle('held', held[i]);
      el.disabled = over || rollsLeft === 3 || rollsLeft === 0;
    });
    const round = Math.min(12, Object.keys(sheets[turn]).length + 1);
    status.replaceChildren(
      h('span', { class: `turn-badge p${turn + 1}` }, nameOf(turn)),
      h('span', { class: 'round' }, `ラウンド ${round}/12`),
      h('span', { class: 'rolls', 'aria-label': `残り${rollsLeft}回` },
        [0, 1, 2].map((i) => h('i', { class: i < rollsLeft ? 'on' : '' }))));
    if (over) {
      action.textContent = 'ゲーム終了';
      action.disabled = true;
    } else if (cpuTurnNow()) {
      action.classList.remove('commit');
      action.disabled = true;
      action.textContent = 'CPU が考えています…';
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

  // 3D のサイコロ (使えない環境では、もとの平らなサイコロのまま)
  let alive = true;
  let detachDice = () => {};
  import('../real/dice.js')
    .then((m) => { if (alive) detachDice = m.attachDice(body.querySelector('.dice-tray'), diceEls); })
    .catch(() => {});
  return () => { alive = false; detachDice(); };
}
