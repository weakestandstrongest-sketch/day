import { h, gameShell, sfx, loadPref, savePref, think, showResult, toast, modal, CPU_LEVELS } from '../ui.js';

// いろあわせ：色か数字（記号）が同じカードを出して、手札を先になくした人の勝ち。あなたと CPU 3 人
const RULES = `
<p>あなたと CPU 3 人の 4 人で遊びます。手札 7 枚から始めて、先に手札をなくした人の勝ちです。</p>
<ul>
<li>場のいちばん上のカードと<b>同じ色</b>か、<b>同じ数字・同じ記号</b>のカードを 1 枚出します。</li>
<li>出せないとき（出したくないとき）は山から 1 枚<b>引きます</b>。引いたカードが出せれば、そのまま出してもかまいません。</li>
<li><b>休</b>（やすみ）：次の人は 1 回休み。<b>⇄</b>（はんてん）：回る向きが逆になる。<b>+2</b>：次の人は 2 枚引いて休み。</li>
<li><b>いろ</b>：いつでも出せて、次の色を決められます。<b>いろ+4</b>：色を決め、次の人は 4 枚引いて休み。</li>
<li>だれかが上がったら、残りの人の手札が上がった人の点になります（数字はその数、休・⇄・+2 は 20、いろ・いろ+4 は 50）。</li>
</ul>`;

const COLORS = [
  { k: 0, name: '朱', hex: '#d4543f' },
  { k: 1, name: '黄', hex: '#e2ad2b' },
  { k: 2, name: '緑', hex: '#4a9a68' },
  { k: 3, name: '藍', hex: '#3d6cb3' },
];
const NAMES = ['あなた', 'CPU 1', 'CPU 2', 'CPU 3'];
const SEAT = ['s-me', 's-left', 's-top', 's-right'];
// v: 0-9 数字 / 'skip' / 'rev' / 'd2' / 'wild' / 'w4'
const SYM = { skip: '休', rev: '⇄', d2: '+2', wild: 'いろ', w4: '+4' };
const isWild = (c) => c.v === 'wild' || c.v === 'w4';
const points = (c) => (typeof c.v === 'number' ? c.v : isWild(c) ? 50 : 20);
const rnd = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function makeDeck() {
  const d = []; let id = 0;
  for (let c = 0; c < 4; c++) {
    d.push({ id: id++, c, v: 0 });
    for (let k = 0; k < 2; k++) {
      for (let v = 1; v <= 9; v++) d.push({ id: id++, c, v });
      for (const v of ['skip', 'rev', 'd2']) d.push({ id: id++, c, v });
    }
  }
  for (let k = 0; k < 4; k++) { d.push({ id: id++, c: -1, v: 'wild' }); d.push({ id: id++, c: -1, v: 'w4' }); }
  return shuffle(d);
}
const order = (a, b) => (a.c === -1) - (b.c === -1) || a.c - b.c || String(a.v).localeCompare(String(b.v), 'ja', { numeric: true });

function cardEl(c, { cls = '', attrs = {}, color = null } = {}) {
  if (isWild(c)) {
    return h('span', { class: `ic-card wild ${cls}`, style: color != null ? { '--cc': COLORS[color].hex } : null, ...attrs },
      h('span', { class: 'ic-quads' }, COLORS.map((k) => h('i', { style: { background: k.hex } }))),
      h('b', {}, c.v === 'w4' ? '+4' : 'いろ'),
      h('small', { class: 'tl' }, c.v === 'w4' ? '+4' : '◆'));
  }
  const t = typeof c.v === 'number' ? String(c.v) : SYM[c.v];
  return h('span', { class: `ic-card ${typeof c.v === 'number' ? '' : 'act'} ${cls}`, style: { '--cc': COLORS[c.c].hex }, ...attrs },
    h('b', {}, t), h('small', { class: 'tl' }, t), h('small', { class: 'br' }, t));
}

export function mount(root) {
  let opts = loadPref('iroawase.opts', { level: 'normal' });
  let S = null, gen = 0;
  const ui = gameShell(root, { title: 'いろあわせ', rules: RULES, onRestart: () => { gen++; showSetup(); } });
  const body = h('div', { class: 'ct-body ia' });
  ui.main.append(body);

  function showSetup() {
    const seg = h('div', { class: 'segmented' }, Object.entries(CPU_LEVELS).map(([k, l]) => h('button', {
      class: opts.level === k ? 'on' : '',
      onclick: () => { opts = { level: k }; savePref('iroawase.opts', opts); sfx('tap'); showSetup(); },
    }, l)));
    body.replaceChildren(h('div', { class: 'hb-card' },
      h('h2', {}, 'いろあわせ'),
      h('p', { class: 'muted', style: { textAlign: 'center' } }, '色か数字をあわせて、手札をなくす。あなたと CPU 3 人で遊びます'),
      h('div', { class: 'hb-option' }, h('span', {}, 'CPU の強さ'), seg),
      h('button', { class: 'btn primary big', onclick: () => newRound(true) }, 'はじめる')));
  }

  function newRound(first) {
    const g = ++gen;
    const draw = makeDeck();
    const hands = [0, 1, 2, 3].map(() => draw.splice(0, 7).sort(order));
    let top; do { top = draw.shift(); if (typeof top.v !== 'number') draw.push(top); } while (typeof top.v !== 'number');
    S = { hands, draw, pile: [top], color: top.c, dir: 1, turn: first ? 0 : (S.winner + 1) % 4, scores: first ? [0, 0, 0, 0] : S.scores, drew: null, last: Array(4).fill(''), winner: -1, round: first ? 1 : S.round + 1 };
    render();
    loop(g);
  }

  const top = () => S.pile[S.pile.length - 1];
  const canPlay = (c) => isWild(c) || c.c === S.color || c.v === top().v;
  const nextOf = (p, k = 1) => (((p + S.dir * k) % 4) + 4) % 4;

  function takeCards(p, n) {
    const got = [];
    for (let i = 0; i < n; i++) {
      if (!S.draw.length) { const t = S.pile.pop(); S.draw = shuffle(S.pile); S.pile = [t]; }
      if (!S.draw.length) break;
      got.push(S.draw.shift());
    }
    S.hands[p] = S.hands[p].concat(got).sort(order);
    return got;
  }

  async function loop(g) {
    while (g === gen && S.winner < 0) {
      const p = S.turn;
      if (p === 0) { render(); return; }
      render(`${NAMES[p]}が考えています…`);
      await think(opts.level === 'easy' ? 650 : 850);
      if (g !== gen) return;
      cpuTurn(p);
      await think(300);
    }
  }

  function chooseColorFor(hand) {
    const n = [0, 0, 0, 0];
    hand.forEach((c) => { if (c.c >= 0) n[c.c]++; });
    const m = Math.max(...n);
    return m ? n.indexOf(m) : rnd(4);
  }

  function cpuPick(p) {
    const hand = S.hands[p], legal = hand.filter(canPlay);
    if (!legal.length) return null;
    if (opts.level === 'easy') return legal[rnd(legal.length)];
    const nx = S.hands[nextOf(p)].length;
    const n = [0, 0, 0, 0]; hand.forEach((c) => { if (c.c >= 0) n[c.c]++; });
    const score = (c) => {
      let s = 0;
      if (isWild(c)) s += c.v === 'w4' ? 60 : 40; // いろは最後のほうにとっておく
      else s -= n[c.c] * 4 + (typeof c.v === 'number' ? c.v * 0.5 : 6); // 多い色・大きい数から減らす
      if (nx <= 2 && (c.v === 'd2' || c.v === 'skip' || c.v === 'w4')) s -= opts.level === 'hard' ? 120 : 40; // 次の人が上がりそうなら止める
      if (opts.level === 'hard' && hand.length <= 2 && isWild(c)) s -= 30;
      return s;
    };
    return legal.sort((a, b) => score(a) - score(b))[0];
  }

  function cpuTurn(p) {
    let c = cpuPick(p);
    if (!c) {
      const [got] = takeCards(p, 1);
      S.last[p] = '引いた'; sfx('flip');
      if (got && canPlay(got) && (opts.level !== 'easy' || Math.random() < 0.6)) c = got;
      else { advance(p, 1); render(); return; }
    }
    play(p, c, isWild(c) ? chooseColorFor(S.hands[p].filter((x) => x.id !== c.id)) : null);
  }

  function advance(p, steps) { S.turn = nextOf(p, steps); S.drew = null; }

  function play(p, c, color) {
    S.hands[p] = S.hands[p].filter((x) => x.id !== c.id);
    S.pile.push(c);
    S.color = isWild(c) ? color : c.c;
    S.last[p] = '';
    sfx('place');
    let steps = 1, note = '';
    if (c.v === 'skip') { steps = 2; note = `${NAMES[nextOf(p)]}は休み`; }
    else if (c.v === 'rev') { S.dir = -S.dir; note = '向きが逆に'; }
    else if (c.v === 'd2') { const v = nextOf(p); takeCards(v, 2); S.last[v] = '+2'; steps = 2; note = `${NAMES[v]}は 2 枚引いて休み`; }
    else if (c.v === 'w4') { const v = nextOf(p); takeCards(v, 4); S.last[v] = '+4'; steps = 2; note = `${NAMES[v]}は 4 枚引いて休み`; }
    if (isWild(c)) note = `${note ? note + '・' : ''}次は${COLORS[S.color].name}`;
    if (!S.hands[p].length) { S.winner = p; render(); endRound(); return; }
    if (S.hands[p].length === 1) note = `${NAMES[p]}はあと 1 枚！`;
    advance(p, steps);
    if (note) flash(note);
    render();
  }

  function flash(text) {
    const el = h('div', { class: 'ct-flash' }, text);
    ui.main.append(el);
    setTimeout(() => el.remove(), 1300);
  }

  async function humanPlay(c) {
    if (S.turn !== 0 || S.winner >= 0 || !canPlay(c)) { if (S.turn === 0) { sfx('error'); toast('そのカードは出せません'); } return; }
    if (S.drew && S.drew.id !== c.id) { toast('引いたカードを出すか、パスしてください'); return; }
    let color = null;
    if (isWild(c)) {
      color = await modal({ title: '次の色', body: h('p', {}, '次の色を選んでください'), dismissible: false, className: 'ia-colors',
        buttons: COLORS.map((k) => ({ label: k.name, value: String(k.k) })) });
      color = +color;
    }
    play(0, c, color);
    loop(gen);
  }

  function humanDraw() {
    if (S.turn !== 0 || S.drew || S.winner >= 0) return;
    const [got] = takeCards(0, 1); sfx('flip');
    if (got && canPlay(got)) { S.drew = got; render('引いたカードを出せます'); return; }
    advance(0, 1); render(); loop(gen);
  }
  function humanPass() { if (S.turn !== 0 || !S.drew) return; advance(0, 1); render(); loop(gen); }

  async function endRound() {
    const w = S.winner;
    const gained = S.hands.reduce((s, hd, q) => s + (q === w ? 0 : hd.reduce((a, c) => a + points(c), 0)), 0);
    S.scores[w] += gained;
    sfx(w === 0 ? 'win' : 'check');
    const wins = loadPref('iroawase.wins', 0) + (w === 0 ? 1 : 0); savePref('iroawase.wins', wins);
    await think(500);
    const r = await showResult({
      title: w === 0 ? 'あなたの勝ち' : `${NAMES[w]}の勝ち`,
      mark: w === 0 ? null : h('span', { class: 'df-mark' }, '負'),
      detail: h('div', { class: 'df-rank' },
        h('p', {}, `${NAMES[w]}に ${gained} 点`),
        [0, 1, 2, 3].map((q) => h('p', {}, h('b', {}, NAMES[q]), ` ${S.scores[q]} 点`, q !== w ? h('small', { class: 'muted' }, `（残り ${S.hands[q].length} 枚）`) : null)),
        h('p', { class: 'muted' }, `第 ${S.round} 回 ・ あなたが勝った回数 ${wins}`)),
      buttons: [{ label: 'やめる', value: 'close' }, { label: '次の回', value: 'again', primary: true }],
    });
    if (r === 'again') newRound(false); else showSetup();
  }

  function seatEl(p) {
    const n = S.hands[p].length;
    return h('div', { class: `ct-seat ${SEAT[p]} ${S.turn === p && S.winner < 0 ? 'turn' : ''}` },
      h('div', { class: 'ct-backs ia-backs' }, Array.from({ length: Math.min(n, 8) }, () => h('i'))),
      h('div', { class: 'ct-name' }, h('b', {}, NAMES[p]), h('small', {}, n === 1 ? 'あと 1 枚！' : `${n} 枚`)),
      S.last[p] ? h('span', { class: 'ct-say' }, S.last[p]) : null);
  }

  function render(msg) {
    if (!S) return;
    const myTurn = S.turn === 0 && S.winner < 0;
    const hand = h('div', { class: 'ct-hand ia-hand', style: { '--n': S.hands[0].length } }, S.hands[0].map((c) => cardEl(c, {
      cls: myTurn && canPlay(c) && (!S.drew || S.drew.id === c.id) ? 'ok' : myTurn ? 'dim' : '',
      attrs: { role: 'button', onclick: () => humanPlay(c) },
    })));
    const t = top();
    const field = h('div', { class: 'ct-field ia-field' },
      h('button', { class: 'ia-deck', disabled: !myTurn || !!S.drew, onclick: humanDraw, 'aria-label': '山から引く' }, h('span', {}, '引く'), h('small', {}, `${S.draw.length}`)),
      h('div', { class: 'ia-pile' }, cardEl(t, { color: isWild(t) ? S.color : null })),
      h('div', { class: 'ia-now', style: { '--cc': COLORS[S.color].hex } }, h('i'), h('span', {}, COLORS[S.color].name), h('em', {}, S.dir > 0 ? '↻' : '↺')));
    const actions = myTurn && S.drew ? [h('button', { class: 'btn', onclick: humanPass }, '出さずに次へ')] : [];
    body.replaceChildren(
      h('div', { class: 'ct-table' }, seatEl(2), seatEl(1), field, seatEl(3)),
      h('p', { class: 'ct-msg' }, msg || (myTurn ? (S.drew ? '引いたカードを出せます' : '出すカードを押すか、山から引いてください') : '')),
      h('div', { class: 'ct-me' }, hand, actions.length ? h('div', { class: 'ct-actions' }, actions) : null));
  }

  showSetup();
  return () => { gen++; };
}
