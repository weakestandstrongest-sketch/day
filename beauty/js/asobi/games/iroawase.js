import { h, gameShell, sfx, loadPref, savePref, think, showResult, toast, modal, CPU_LEVELS } from '../ui.js';
import { fanHand, backFan, plate, spread } from './cards-ui.js';

// いろあわせ：色か数字（記号）が同じカードを出して、手札を先になくした人の勝ち。あなたと CPU 3 人
const RULES = `
<p>あなたと CPU 3 人の 4 人で遊びます。手札 7 枚から始めて、先に手札をなくした人の勝ちです。</p>
<ul>
<li>場のいちばん上のカードと<b>同じ色</b>か、<b>同じ数字・同じ記号</b>のカードを出します。</li>
<li>出せないとき（出したくないとき）は山から 1 枚<b>引きます</b>。引いたカードが出せれば、そのまま出してもかまいません。</li>
<li><b>休</b>：次の人は 1 回休み。<b>⇄</b>：回る向きが逆になる。<b>+2</b>：次の人は 2 枚引いて休み。</li>
<li><b>いろ</b>：いつでも出せて、次の色を決められます。<b>+4</b>：色を決め、次の人は 4 枚引いて休み。</li>
<li>最初にめくったカードが記号なら、その効果は最初の人にかかります。</li>
<li>だれかが上がったら、残りの人の手札がその人の点になります（数字はその数、休・⇄・+2 は 20、いろ・+4 は 50）。</li>
</ul>
<p>はじめる前に、次のルールを入れるか外すかを選べます。</p>
<ul>
<li><b>まとめて出す</b>：同じ数字・同じ記号のカードを何枚でもまとめて出せます（最初の 1 枚が出せれば OK、最後のカードの色が次の色）。休を 2 枚なら 2 人休み、+2 を 2 枚なら +4。</li>
<li><b>+2・+4 を重ねる</b>：+2 には +2（または +4）、+4 には +4 を重ねて、たまった枚数を次の人に回せます。重ねられないと、たまった枚数をまとめて引きます。</li>
<li><b>ラスト宣言</b>：残り 1 枚になるとき、出す前に「ラスト！」を押します。忘れて気づかれたら 2 枚引きます。CPU が忘れたら「指摘する」で 2 枚引かせられます。</li>
<li><b>+4 チャレンジ</b>：+4 には、場の色のカードを持っていたのに出したのでは、と疑えます。当たれば出した人が引き、外れたら自分が 2 枚多く引きます。</li>
<li><b>出せるまで引く</b>：出せるカードが来るまで山から引き続けます。</li>
<li><b>7・0 ルール</b>：7 を出したら好きな人と手札を交換、0 を出したらみんなの手札を回る向きの次の人へ回します。</li>
<li><b>500 点で優勝</b>：回を重ねて、先に 500 点に届いた人の優勝です。</li>
</ul>`;

const RULE_LIST = [
  { k: 'multi', name: 'まとめて出す', desc: '同じ数字・記号のカードを、何枚でもまとめて出せる', on: true },
  { k: 'stack', name: '+2・+4 を重ねる', desc: '+2 や +4 を重ねて、たまった枚数を次の人へ回せる', on: true },
  { k: 'call', name: 'ラスト宣言', desc: '残り 1 枚になるとき「ラスト！」。忘れて気づかれたら 2 枚引く', on: true },
  { k: 'challenge', name: '+4 チャレンジ', desc: '+4 を疑える。当たれば出した人が引き、外れたら 2 枚多く引く', on: true },
  { k: 'drawall', name: '出せるまで引く', desc: '出せるカードが来るまで、山から引き続ける', on: false },
  { k: 'sevenzero', name: '7・0 ルール', desc: '7 で好きな人と手札を交換、0 でみんなの手札を次の人へ回す', on: false },
  { k: 'match', name: '500 点で優勝', desc: '回を重ねて、先に 500 点に届いた人の優勝', on: true },
];
const defaultRules = () => Object.fromEntries(RULE_LIST.map((r) => [r.k, r.on]));

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
  opts.rules = { ...defaultRules(), ...(opts.rules || {}) };
  const R = () => opts.rules;
  let S = null, gen = 0;
  const ui = gameShell(root, { title: 'いろあわせ', rules: RULES, onRestart: () => { gen++; showSetup(); } });
  const body = h('div', { class: 'ct-body ia' });
  ui.main.append(body);
  const LV = () => ({ easy: 0, normal: 1, hard: 2 }[opts.level] ?? 1);

  function showSetup() {
    const seg = h('div', { class: 'segmented' }, Object.entries(CPU_LEVELS).map(([k, l]) => h('button', {
      class: opts.level === k ? 'on' : '',
      onclick: () => { opts = { ...opts, level: k }; savePref('iroawase.opts', opts); sfx('tap'); showSetup(); },
    }, l)));
    const rules = h('div', { class: 'df-rules' }, RULE_LIST.map((r) => h('button', {
      class: `df-rule ${opts.rules[r.k] ? 'on' : ''}`,
      'aria-pressed': String(!!opts.rules[r.k]),
      onclick: () => { opts.rules = { ...opts.rules, [r.k]: !opts.rules[r.k] }; savePref('iroawase.opts', opts); sfx('tap'); showSetup(); },
    }, h('b', {}, r.name), h('small', {}, r.desc), h('i', {}, opts.rules[r.k] ? 'あり' : 'なし'))));
    body.replaceChildren(h('div', { class: 'hb-card df-setup' },
      h('h2', {}, 'いろあわせ'),
      h('p', { class: 'muted', style: { textAlign: 'center' } }, '色か数字をあわせて、手札をなくす。あなたと CPU 3 人で遊びます'),
      h('div', { class: 'hb-option' }, h('span', {}, 'CPU の強さ'), seg),
      h('div', { class: 'hb-option' }, h('span', {}, 'ルール（押すと あり／なし）'), rules),
      h('button', { class: 'btn primary big', onclick: () => newRound(true) }, 'はじめる')));
  }

  async function newRound(first) {
    const g = ++gen;
    const draw = makeDeck();
    const hands = [0, 1, 2, 3].map(() => draw.splice(0, 7).sort(order));
    // 最初の 1 枚（+4 なら山に戻してめくり直す）
    let top0; do { top0 = draw.shift(); if (top0.v === 'w4') draw.push(top0); } while (top0.v === 'w4');
    const starter = first ? 0 : (S.winner + 1) % 4;
    S = { hands, draw, pile: [top0], color: top0.c, dir: 1, turn: starter, scores: first ? [0, 0, 0, 0] : S.scores, drew: null, last: Array(4).fill(''), winner: -1,
      round: first ? 1 : S.round + 1, pending: null, w4: null, sel: [], called: false, forgot: -1 };
    // 最初のカードの効果は、最初の人にかかる
    if (top0.v === 'skip') { S.last[starter] = '休み'; S.turn = nextOf(starter); flash(`${NAMES[starter]}は休み`); }
    else if (top0.v === 'rev') { S.dir = -1; flash('向きが逆から'); }
    else if (top0.v === 'd2') { S.pending = { n: 2, kind: 'd2' }; }
    else if (top0.v === 'wild') {
      if (starter === 0) { render('最初の色を選んでください'); S.color = await askColor(); if (g !== gen) return; }
      else S.color = chooseColorFor(S.hands[starter]);
      flash(`最初の色は${COLORS[S.color].name}`);
    }
    render();
    loop(g);
  }

  const top = () => S.pile[S.pile.length - 1];
  const nextOf = (p, k = 1) => (((p + (S ? S.dir : 1) * k) % 4) + 4) % 4;
  // 出せるか（+2・+4 がたまっているときは、重ねられるカードだけ）
  const canPlay = (c) => {
    if (S.pending) return !!R().stack && (c.v === S.pending.kind || (c.v === 'w4' && S.pending.kind === 'd2'));
    return isWild(c) || c.c === S.color || c.v === top().v;
  };
  const askColor = () => modal({ title: '次の色', body: h('p', {}, '次の色を選んでください'), dismissible: false, className: 'ia-colors',
    buttons: COLORS.map((k) => ({ label: k.name, value: String(k.k) })) }).then((v) => +v);

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
      await cpuTurn(p);
      if (g !== gen) return;
      await think(300);
    }
  }

  function chooseColorFor(hand) {
    const n = [0, 0, 0, 0];
    hand.forEach((c) => { if (c.c >= 0) n[c.c]++; });
    const m = Math.max(...n);
    return m ? n.indexOf(m) : rnd(4);
  }

  // CPU：出すカードの組（同じ数字・記号をまとめる）を選ぶ
  function cpuPick(p) {
    const hand = S.hands[p], legal = hand.filter(canPlay);
    if (!legal.length) return null;
    let c;
    if (opts.level === 'easy') c = legal[rnd(legal.length)];
    else {
      const nx = S.hands[nextOf(p)].length;
      const n = [0, 0, 0, 0]; hand.forEach((x) => { if (x.c >= 0) n[x.c]++; });
      const score = (x) => {
        let s = 0;
        if (isWild(x)) s += x.v === 'w4' ? 60 : 40; // いろは最後のほうにとっておく
        else s -= n[x.c] * 4 + (typeof x.v === 'number' ? x.v * 0.5 : 6); // 多い色・大きい数から減らす
        if (R().multi) s -= (hand.filter((y) => y.v === x.v).length - 1) * 6; // まとめて減らせるもの
        if (nx <= 2 && (x.v === 'd2' || x.v === 'skip' || x.v === 'w4')) s -= opts.level === 'hard' ? 120 : 40; // 次の人が上がりそうなら止める
        if (opts.level === 'hard' && hand.length <= 2 && isWild(x)) s -= 30;
        return s;
      };
      c = legal.sort((a, b) => score(a) - score(b))[0];
    }
    if (!R().multi || c.v === 'wild') return [c];
    // 同じ数字・記号を全部。最後は、自分がいちばん多く持っている色にする
    const rest = hand.filter((x) => x.id !== c.id && x.v === c.v);
    const left = hand.filter((x) => x.v !== c.v);
    const want = chooseColorFor(left);
    rest.sort((a, b) => (a.c === want) - (b.c === want));
    return [c, ...rest];
  }

  async function cpuTurn(p) {
    const lv = LV();
    // +2・+4 がたまっている
    if (S.pending) {
      const stackable = S.hands[p].filter(canPlay);
      if (S.w4 && R().challenge && !stackable.length && Math.random() < [0.15, 0.25, 0.35][lv]) { resolveChallenge(p); return; }
      if (stackable.length) { const grp = cpuPick(p); await playCards(p, grp, isWild(grp[grp.length - 1]) ? chooseColorFor(S.hands[p].filter((x) => !grp.includes(x))) : null); return; }
      drawPending(p); return;
    }
    let grp = cpuPick(p);
    if (!grp) {
      const got = drawForTurn(p);
      S.last[p] = got.length > 1 ? `${got.length} 枚引いた` : '引いた'; sfx('flip');
      const g1 = got[got.length - 1];
      if (g1 && canPlay(g1) && (opts.level !== 'easy' || Math.random() < 0.6)) grp = [g1];
      else { advance(p, 1); render(); return; }
    }
    const lastC = grp[grp.length - 1];
    await playCards(p, grp, isWild(lastC) ? chooseColorFor(S.hands[p].filter((x) => !grp.includes(x))) : null);
  }

  // 山から引く（出せるまで引くルールなら、出せるカードが来るまで）
  function drawForTurn(p) {
    const got = [];
    do { const [c] = takeCards(p, 1); if (!c) break; got.push(c); if (canPlay(c)) break; } while (R().drawall && got.length < 30);
    return got;
  }
  function drawPending(p) {
    const n = S.pending.n;
    takeCards(p, n); S.last[p] = `+${n} 引いた`; sfx('flip');
    S.pending = null; S.w4 = null;
    advance(p, 1); render();
  }
  // +4 チャレンジ：p が、直前に +4 を出した人を疑う
  function resolveChallenge(p) {
    const w = S.w4, n = S.pending.n;
    if (w.guilty) {
      takeCards(w.by, n); S.last[w.by] = `+${n} 引いた`;
      flash(`チャレンジ成功！${NAMES[w.by]}が ${n} 枚`);
      S.pending = null; S.w4 = null; // 疑った人は、そのままふつうに出せる
      render();
      return 'ok';
    }
    takeCards(p, n + 2); S.last[p] = `+${n + 2} 引いた`;
    flash(`チャレンジ失敗…${NAMES[p]}が ${n + 2} 枚`);
    S.pending = null; S.w4 = null;
    advance(p, 1); render();
    return 'ng';
  }

  function advance(p, steps) { S.turn = nextOf(p, steps); S.drew = null; S.sel = []; }

  async function playCards(p, cards, color) {
    const g = gen;
    if (S.forgot >= 0 && S.forgot !== p) S.forgot = -1; // 指摘できるのは次の人が出すまで
    const prevColor = S.color, hadPending = S.pending;
    const ids = new Set(cards.map((c) => c.id));
    S.hands[p] = S.hands[p].filter((x) => !ids.has(x.id));
    cards.forEach((c) => S.pile.push(c));
    const lastC = cards[cards.length - 1], k = cards.length, v = cards[0].v;
    S.color = isWild(lastC) ? color : lastC.c;
    S.last[p] = ''; S.drew = null; S.sel = [];
    sfx('place');
    let steps = 1;
    const notes = [];
    if (k > 1) notes.push(`${k} 枚まとめて`);
    if (v === 'skip') { steps = 1 + k; notes.push(k > 1 ? `${k} 人休み` : `${NAMES[nextOf(p)]}は休み`); }
    else if (v === 'rev') { if (k % 2) S.dir = -S.dir; notes.push(k % 2 ? '向きが逆に' : '向きはそのまま'); }
    else if (v === 'd2' || v === 'w4') {
      const add = (v === 'd2' ? 2 : 4) * k;
      // +4 を、場の色のカードを持っていたのに出したか（チャレンジ用）
      const guilty = v === 'w4' && S.hands[p].some((x) => x.c === prevColor && !isWild(x));
      S.pending = { n: (hadPending ? hadPending.n : 0) + add, kind: v };
      S.w4 = v === 'w4' ? { by: p, guilty } : null;
      notes.push(`+${S.pending.n}`);
    }
    if (isWild(lastC)) notes.push(`次は${COLORS[S.color].name}`);
    // 上がり（最後が +2・+4 なら、次の人は引いてから点を数える）
    if (!S.hands[p].length) {
      if (S.pending) { const v2 = nextOf(p); takeCards(v2, S.pending.n); S.last[v2] = `+${S.pending.n} 引いた`; S.pending = null; S.w4 = null; }
      S.winner = p; render(); endRound(); return;
    }
    // ラスト宣言
    if (S.hands[p].length === 1 && R().call) {
      if (p === 0) {
        if (S.called) notes.push('ラスト！');
        else if (Math.random() < [0.35, 0.65, 0.9][LV()]) { takeCards(0, 2); toast('ラスト宣言を忘れて、気づかれました。2 枚引きます', { duration: 2400 }); }
      } else if (Math.random() < [0.3, 0.12, 0.04][LV()]) S.forgot = p; // CPU が言い忘れた
      else notes.push(`${NAMES[p]}：ラスト！`);
    } else if (S.hands[p].length === 1) notes.push(`${NAMES[p]}はあと 1 枚！`);
    S.called = false;
    // 7・0 ルール
    if (R().sevenzero && v === 7) {
      let to;
      if (p === 0) to = await modal({ title: '7：手札を交換', body: h('p', {}, 'だれと手札を交換しますか？'), dismissible: false, className: 'ia-colors',
        buttons: [1, 2, 3].map((q) => ({ label: `${NAMES[q]}（${S.hands[q].length} 枚）`, value: String(q) })) }).then((x) => +x);
      else to = [0, 1, 2, 3].filter((q) => q !== p).sort((a, b) => S.hands[a].length - S.hands[b].length)[0];
      if (g !== gen) return;
      if (S.hands[to].length < S.hands[p].length || p === 0) { [S.hands[p], S.hands[to]] = [S.hands[to], S.hands[p]]; notes.push(`${NAMES[p]}と${NAMES[to]}が交換`); }
      if (S.forgot === p || S.forgot === to) S.forgot = -1;
    } else if (R().sevenzero && v === 0) {
      const old = S.hands.slice();
      for (let q = 0; q < 4; q++) S.hands[nextOf(q)] = old[q];
      S.forgot = -1;
      notes.push('手札をまわす');
    }
    advance(p, steps);
    if (notes.length) flash(notes.join('　'));
    render();
  }

  function flash(text) {
    const el = h('div', { class: 'ct-flash' }, text);
    ui.main.append(el);
    setTimeout(() => el.remove(), 1400);
  }

  // ---- あなたの操作 ----
  const myTurn = () => S && S.turn === 0 && S.winner < 0;
  async function tapCard(c) {
    if (!myTurn()) return;
    if (S.drew && S.drew.id !== c.id) { toast('引いたカードを出すか、「出さずに次へ」を押してください'); return; }
    const sel = S.sel;
    if (sel.includes(c.id)) { // 選んだのをやめる
      const i = sel.indexOf(c.id); S.sel = i === 0 ? [] : sel.filter((x) => x !== c.id); sfx('tap'); render(); return;
    }
    if (sel.length) {
      const first = S.hands[0].find((x) => x.id === sel[0]);
      if (first && c.v === first.v) { S.sel = sel.concat(c.id); sfx('tap'); render(); return; }
      S.sel = [];
    }
    if (!canPlay(c)) { sfx('error'); toast(S.pending ? `重ねられるカードがなければ、${S.pending.n} 枚引きます` : 'そのカードは出せません'); render(); return; }
    // 同じ数字・記号がほかにもあれば、まとめて出せるように選ぶ
    const same = S.hands[0].filter((x) => x.id !== c.id && x.v === c.v);
    if (R().multi && same.length && !S.drew) { S.sel = [c.id]; sfx('tap'); render(); return; }
    await humanPlay([c]);
  }
  async function humanPlay(cards) {
    const g = gen;
    const lastC = cards[cards.length - 1];
    let color = null;
    if (isWild(lastC)) { color = await askColor(); if (g !== gen) return; }
    await playCards(0, cards, color);
    if (g === gen) loop(gen);
  }
  function humanDeck() {
    if (!myTurn() || S.drew) return;
    if (S.pending) { drawPending(0); loop(gen); return; }
    S.sel = [];
    const got = drawForTurn(0); sfx('flip');
    const g1 = got[got.length - 1];
    if (got.length > 1) toast(`${got.length} 枚引きました`);
    if (g1 && canPlay(g1)) { S.drew = g1; render('引いたカードを出せます'); return; }
    advance(0, 1); render(); loop(gen);
  }
  function humanPass() { if (!myTurn() || !S.drew) return; advance(0, 1); render(); loop(gen); }

  async function endRound() {
    const w = S.winner;
    const gained = S.hands.reduce((s, hd, q) => s + (q === w ? 0 : hd.reduce((a, c) => a + points(c), 0)), 0);
    S.scores[w] += gained;
    sfx(w === 0 ? 'win' : 'check');
    const wins = loadPref('iroawase.wins', 0) + (w === 0 ? 1 : 0); savePref('iroawase.wins', wins);
    const champ = R().match ? S.scores.findIndex((x) => x >= 500) : -1;
    await think(500);
    const r = await showResult({
      title: champ >= 0 ? (champ === 0 ? 'あなたの優勝！' : `${NAMES[champ]}の優勝`) : w === 0 ? 'あなたの勝ち' : `${NAMES[w]}の勝ち`,
      mark: (champ >= 0 ? champ : w) === 0 ? null : h('span', { class: 'df-mark' }, '負'),
      detail: h('div', { class: 'df-rank' },
        h('p', {}, `${NAMES[w]}に ${gained} 点`),
        [0, 1, 2, 3].map((q) => h('p', {}, h('b', {}, NAMES[q]), ` ${S.scores[q]} 点`, q !== w ? h('small', { class: 'muted' }, `（残り ${S.hands[q].length} 枚）`) : null)),
        h('p', { class: 'muted' }, `第 ${S.round} 回${R().match ? ' ・ 500 点で優勝' : ''} ・ あなたが勝った回数 ${wins}`)),
      buttons: [{ label: 'やめる', value: 'close' }, { label: champ >= 0 ? '新しく始める' : '次の回', value: 'again', primary: true }],
    });
    if (r === 'again') newRound(champ >= 0); else showSetup();
  }

  function seat(p) {
    const n = S.hands[p].length;
    return [backFan(n, SEAT[p], 'iro'), plate({
      name: NAMES[p], where: SEAT[p], sub: `${n === 1 ? 'あと 1 枚！' : `${n} 枚`}${R().match ? ` ・ ${S.scores[p]} 点` : ''}`,
      say: S.last[p], turn: S.turn === p && S.winner < 0,
    })];
  }

  function render(msg) {
    if (!S) return;
    const mine = myTurn();
    const sel = S.sel;
    const W = body.clientWidth || 380;
    const cw = Math.max(56, Math.min(72, Math.round(W / 6.2)));
    const first = sel.length ? S.hands[0].find((x) => x.id === sel[0]) : null;
    const hand = fanHand(S.hands[0].map((c) => {
      const picked = sel.includes(c.id);
      const ok = mine && (first ? c.v === first.v : canPlay(c) && (!S.drew || S.drew.id === c.id));
      return cardEl(c, { cls: picked ? 'sel' : ok ? 'ok' : mine ? 'dim' : '', attrs: { role: 'button', onclick: () => tapCard(c) } });
    }), W, { cw, ch: Math.round(cw * 1.45) });
    // 場：いちばん上のカードと、その下に少し前のカード
    const t = top();
    const recent = S.pile.slice(-3);
    const fresh = S.lastTop !== t.id; S.lastTop = t.id;
    const sp = spread(recent, (c) => cardEl(c, { color: c === t && isWild(t) ? S.color : null }));
    [...sp.children].forEach((el, i) => { if (i < recent.length - 1) el.style.filter = 'brightness(.55)'; });
    if (fresh) sp.lastElementChild.classList.add('fresh');
    const deck = h('button', { class: `ia-deck2 ${S.pending && mine ? 'hot' : ''}`, disabled: !mine || !!S.drew, onclick: humanDeck, 'aria-label': '山から引く' },
      backFan(1, 'deck', 'iro').firstElementChild, h('span', { class: 'lbl' }, S.pending && mine ? `+${S.pending.n} 引く` : `引く ・ ${S.draw.length}`));
    const field = h('div', { class: 't2-field' },
      h('div', { class: 'ia-row' }, deck, h('div', { class: 'ia-pile' }, sp, S.pending ? h('span', { class: 'ia-pend' }, `+${S.pending.n}`) : null)),
      h('div', { class: 'ia-now', style: { '--cc': COLORS[S.color].hex } }, h('i'), h('span', {}, COLORS[S.color].name), h('em', {}, S.dir > 0 ? '↻' : '↺')));
    const acts = [];
    if (S.forgot >= 0) acts.push(h('button', { class: 'btn commit', onclick: () => { const q = S.forgot; S.forgot = -1; takeCards(q, 2); S.last[q] = '+2 指摘'; flash(`${NAMES[q]}はラスト宣言を忘れていました。2 枚`); sfx('check'); render(); } }, `指摘する（${NAMES[S.forgot]}）`));
    if (mine) {
      const left = S.hands[0].length - Math.max(1, sel.length);
      if (R().call && left === 1 && !S.called && !S.pending) acts.push(h('button', { class: 'btn commit', onclick: () => { S.called = true; sfx('check'); flash('ラスト！'); render(); } }, 'ラスト！'));
      if (S.pending) {
        acts.push(h('button', { class: 'btn', onclick: humanDeck }, `${S.pending.n} 枚引く`));
        if (S.w4 && R().challenge && S.w4.by !== 0) acts.push(h('button', { class: 'btn', onclick: () => { if (resolveChallenge(0) === 'ng') loop(gen); } }, 'チャレンジ'));
      }
      if (S.drew) acts.push(h('button', { class: 'btn', onclick: humanPass }, '出さずに次へ'));
      if (sel.length) {
        acts.push(h('button', { class: 'btn', onclick: () => { S.sel = []; render(); } }, 'やめる'));
        acts.push(h('button', { class: 'btn primary', onclick: () => humanPlay(sel.map((id) => S.hands[0].find((x) => x.id === id))) }, sel.length > 1 ? `${sel.length} 枚出す` : '出す'));
      }
    }
    const hint = mine ? (S.pending ? (S.hands[0].some(canPlay) ? `+${S.pending.n} がきています。重ねるか、引くか${S.w4 && R().challenge ? '、チャレンジするか' : ''}` : `+${S.pending.n} がきています。引くか${S.w4 && R().challenge ? '、チャレンジするか' : ''}選んでください`)
      : S.drew ? '引いたカードを出せます' : sel.length ? '同じ数字・記号を足せます。最後に選んだカードの色が次の色です' : '出すカードを押すか、山から引いてください') : '';
    body.replaceChildren(
      h('div', { class: 't2' }, ...seat(2), ...seat(1), ...seat(3), field),
      h('p', { class: 'ct-msg' }, msg || hint),
      h('div', { class: 't2-me' }, acts.length ? h('div', { class: 'ct-actions' }, acts) : null, h('div', { class: 't2-hand' }, hand)));
  }

  showSetup();
  return () => { gen++; };
}
