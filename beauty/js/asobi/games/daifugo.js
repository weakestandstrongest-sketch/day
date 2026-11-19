import { h, gameShell, sfx, loadPref, savePref, think, showResult, toast, CPU_LEVELS } from '../ui.js';
import { SUITS, RANKS, deal, sortHand, analyze, beats, legalPlays, cpuPlay, hasEight, isRevolution, strongest, weakest, titleOf } from './daifugo-logic.js';

const RULES = `
<p>あなたと CPU 3 人の 4 人で遊びます。手札を先になくした人から上がりです。</p>
<ul>
<li>カードの強さは <b>3 &lt; 4 &lt; … &lt; K &lt; A &lt; 2 &lt; ジョーカー</b>。</li>
<li>場と<b>同じ枚数</b>で、<b>より強い</b>カードを出します。出せないとき・出したくないときは<b>パス</b>。一度パスすると、その場が流れるまで出せません。</li>
<li>出せるのは、1 枚・同じ数字の 2〜4 枚・同じマークで続いた 3 枚以上（<b>階段</b>）。ジョーカーはどのカードの代わりにもなります。</li>
<li>自分以外がみんなパスしたら場が流れ、最後に出した人から好きなカードを出せます。</li>
<li><b>8 切り</b>：8 を出すとすぐに場が流れ、出した人から続けて出せます。</li>
<li><b>革命</b>：同じ数字を 4 枚出すと、強さが逆になります（もう一度起きると元に戻ります）。</li>
<li>上がった順に <b>大富豪・富豪・貧民・大貧民</b>。次のゲームのはじめに、大貧民は強い 2 枚を大富豪へ、貧民は強い 1 枚を富豪へ渡し、大富豪・富豪は好きなカードを同じ枚数返します。</li>
<li>はじめのゲームは ♦3 を持っている人から、次からは大貧民から始めます。</li>
</ul>`;

const NAMES = ['あなた', 'CPU 1', 'CPU 2', 'CPU 3'];
const SEAT = ['s-me', 's-left', 's-top', 's-right'];

export function cardEl(c, extra = {}) {
  if (c.j) return h('span', { class: `pc joker ${extra.cls || ''}`, ...extra.attrs }, h('b', {}, 'J'), h('i', {}, '★'), h('em', {}, 'JOKER'));
  const red = c.s === 1 || c.s === 2;
  return h('span', { class: `pc ${red ? 'red' : ''} ${extra.cls || ''}`, ...extra.attrs }, h('b', {}, RANKS[c.r]), h('i', {}, SUITS[c.s]));
}

export function mount(root) {
  let opts = loadPref('daifugo.opts', { level: 'normal' });
  let S = null, gen = 0, sel = new Set();
  const ui = gameShell(root, { title: '大富豪', rules: RULES, onRestart: () => { gen++; showSetup(); } });
  const body = h('div', { class: 'ct-body df' });
  ui.main.append(body);

  function showSetup() {
    const seg = h('div', { class: 'segmented' }, Object.entries(CPU_LEVELS).map(([k, l]) => h('button', {
      class: opts.level === k ? 'on' : '',
      onclick: () => { opts = { level: k }; savePref('daifugo.opts', opts); sfx('tap'); showSetup(); },
    }, l)));
    body.replaceChildren(h('div', { class: 'hb-card' },
      h('h2', {}, '大富豪'),
      h('p', { class: 'muted', style: { textAlign: 'center' } }, 'あなたと CPU 3 人で遊びます'),
      h('div', { class: 'hb-option' }, h('span', {}, 'CPU の強さ'), seg),
      h('button', { class: 'btn primary big', onclick: () => newRound(true) }, 'はじめる')));
  }

  async function newRound(first) {
    const g = ++gen;
    const prev = first ? null : S.places; // 前のゲームの順位（プレイヤー → 0..3）
    S = { hands: deal(), field: null, fieldBy: -1, rev: false, passed: new Set(), out: [], turn: 0, places: null, prev, round: first ? 1 : S.round + 1, last: Array(4).fill(''), lastPlay: null };
    sel = new Set();
    if (prev) {
      render('カードを交換します');
      await exchange(g);
      if (g !== gen) return;
      S.turn = prev.indexOf(3); // 大貧民から
    } else {
      S.turn = S.hands.findIndex((hd) => hd.some((c) => c.s === 2 && c.r === 0)); // ♦3
    }
    render(S.turn === 0 ? 'あなたからです' : `${NAMES[S.turn]}から始めます`);
    loop(g);
  }

  // ---- 交換 ----
  async function exchange(g) {
    const P = S.prev, who = (place) => P.indexOf(place);
    const give = (from, to, cards) => {
      S.hands[from] = S.hands[from].filter((c) => !cards.includes(c));
      S.hands[to] = sortHand(S.hands[to].concat(cards));
    };
    // 下の人は強いカードを自動で渡す
    const gotFromBottom = strongest(S.hands[who(3)], 2); give(who(3), who(0), gotFromBottom);
    const gotFromLow = strongest(S.hands[who(2)], 1); give(who(2), who(1), gotFromLow);
    for (const [place, k, from] of [[0, 2, gotFromBottom], [1, 1, gotFromLow]]) {
      const p = who(place), to = who(3 - place);
      let back;
      if (p === 0) back = await pickToGive(k, from, titleOf(place), NAMES[to]);
      else back = weakest(S.hands[p], k);
      if (g !== gen) return;
      give(p, to, back);
      if (to === 0) toast(`${NAMES[p]}（${titleOf(place)}）から ${back.map(label).join('・')} をもらいました`, { duration: 2600 });
    }
    const me = P[0];
    if (me === 3 || me === 2) toast(`${me === 3 ? '大富豪' : '富豪'}に ${(me === 3 ? gotFromBottom : gotFromLow).map(label).join('・')} を渡しました`, { duration: 2600 });
  }
  const label = (c) => (c.j ? 'ジョーカー' : SUITS[c.s] + RANKS[c.r]);

  function pickToGive(k, got, title, toName) {
    return new Promise((resolve) => {
      sel = new Set();
      const draw = () => {
        const hand = S.hands[0];
        render(`${title}です。${toName}に返すカードを ${k} 枚選んでください`, {
          got,
          actions: [h('button', {
            class: 'btn primary',
            disabled: sel.size !== k,
            onclick: () => { const cs = hand.filter((c) => sel.has(c.id)); sel = new Set(); sfx('place'); resolve(cs); },
          }, `${k} 枚渡す`)],
          pick: (c) => { if (sel.has(c.id)) sel.delete(c.id); else if (sel.size < k) sel.add(c.id); sfx('tap'); draw(); },
        });
      };
      draw();
    });
  }

  // ---- 進行 ----
  const active = (p) => !S.out.includes(p);
  const nextActive = (p) => { for (let k = 1; k <= 4; k++) { const q = (p + k) % 4; if (active(q)) return q; } return -1; };

  async function loop(g) {
    while (g === gen && S.out.length < 3) {
      const p = S.turn;
      if (S.passed.has(p) || !active(p)) { S.turn = nextActive(p); continue; }
      if (p === 0) { render(S.field ? '出すカードを選んでください' : 'あなたの番です。好きなカードを出せます'); return; } // 人の番：ボタンで続く
      render(`${NAMES[p]}が考えています…`);
      await think(opts.level === 'easy' ? 700 : 900);
      if (g !== gen) return;
      const others = [0, 1, 2, 3].filter((q) => q !== p && active(q)).map((q) => S.hands[q].length);
      const play = cpuPlay(S.hands[p], S.field, S.rev, opts.level, others);
      if (play) doPlay(p, play); else doPass(p);
      await think(350);
    }
    if (g === gen) endRound();
  }

  function doPlay(p, play) {
    const ids = new Set(play.cards.map((c) => c.id));
    S.hands[p] = S.hands[p].filter((c) => !ids.has(c.id));
    S.field = play; S.fieldBy = p; S.lastPlay = { p, play };
    S.last[p] = '';
    let note = '';
    if (isRevolution(play)) { S.rev = !S.rev; note = S.rev ? '革命！' : '革命返し！'; sfx('check'); }
    else sfx('place');
    if (!S.hands[p].length) { S.out.push(p); S.last[p] = titleOf(S.out.length - 1); sfx('win'); }
    if (hasEight(play)) {
      note = (note ? note + ' ' : '') + '8切り';
      clearField(active(p) ? p : nextActive(p));
    } else {
      S.turn = nextActive(p);
      // ほかがみんなパスか上がっていたら流れる
      if (S.turn === -1 || allOthersPassed()) clearField(active(p) ? p : S.turn);
    }
    if (note) flash(note);
    render();
  }

  function allOthersPassed() {
    return [0, 1, 2, 3].filter((q) => active(q) && q !== S.fieldBy).every((q) => S.passed.has(q));
  }

  function doPass(p) {
    S.passed.add(p); S.last[p] = 'パス'; sfx('tap');
    if (allOthersPassed()) {
      // 最後に出した人から（上がっていれば、その次の人から）
      clearField(active(S.fieldBy) ? S.fieldBy : nextActive(S.fieldBy));
    } else S.turn = nextActive(p);
    render();
  }

  function clearField(leader) {
    S.field = null; S.fieldBy = -1; S.passed = new Set(); S.turn = leader;
    S.last = S.last.map((t, q) => (active(q) ? '' : t));
    setTimeout(() => body.querySelector('.ct-field')?.classList.add('cleared'), 0);
  }

  function flash(text) {
    const el = h('div', { class: 'ct-flash' }, text);
    ui.main.append(el);
    setTimeout(() => el.remove(), 1300);
  }

  function humanPlay() {
    const cards = S.hands[0].filter((c) => sel.has(c.id));
    const play = analyze(cards);
    if (!play || !beats(play, S.field, S.rev)) { sfx('error'); toast('そのカードは出せません'); return; }
    sel = new Set();
    doPlay(0, play);
    loop(gen);
  }
  function humanPass() {
    if (!S.field) return;
    sel = new Set();
    doPass(0);
    loop(gen);
  }

  async function endRound() {
    const last = [0, 1, 2, 3].find((q) => !S.out.includes(q));
    S.out.push(last); S.last[last] = titleOf(3);
    S.places = [0, 1, 2, 3].map((q) => S.out.indexOf(q));
    render('ゲーム終了');
    const mine = S.places[0];
    const stats = loadPref('daifugo.stats', [0, 0, 0, 0]); stats[mine]++; savePref('daifugo.stats', stats);
    await think(500);
    const r = await showResult({
      title: `あなたは${titleOf(mine)}`,
      mark: h('span', { class: 'df-mark' }, ['富', '豪', '貧', '民'][mine]),
      detail: h('div', { class: 'df-rank' },
        S.out.map((q, i) => h('p', {}, h('b', {}, titleOf(i)), ` ${NAMES[q]}`)),
        h('p', { class: 'muted' }, `これまで：大富豪 ${stats[0]}・富豪 ${stats[1]}・貧民 ${stats[2]}・大貧民 ${stats[3]}`)),
      buttons: [{ label: 'やめる', value: 'close' }, { label: '次のゲーム', value: 'again', primary: true }],
    });
    if (r === 'again') newRound(false); else showSetup();
  }

  // ---- 描画 ----
  function seatEl(p) {
    const n = S.hands[p].length, place = S.out.indexOf(p);
    return h('div', { class: `ct-seat ${SEAT[p]} ${S.turn === p && place < 0 ? 'turn' : ''} ${place >= 0 ? 'done' : ''}` },
      h('div', { class: 'ct-backs' }, Array.from({ length: Math.min(n, 8) }, () => h('i'))),
      h('div', { class: 'ct-name' }, h('b', {}, NAMES[p]), h('small', {}, place >= 0 ? titleOf(place) : `${n} 枚`)),
      S.prev ? h('span', { class: 'ct-title' }, titleOf(S.prev[p])) : null,
      S.last[p] && place < 0 ? h('span', { class: 'ct-say' }, S.last[p]) : null);
  }

  function render(msg, ex = {}) {
    if (!S) return;
    const myTurn = S.turn === 0 && !ex.pick && active(0) && S.out.length < 3;
    const playable = myTurn ? new Set(legalPlays(S.hands[0], S.field, S.rev).flatMap((p) => p.cards.map((c) => c.id))) : null;
    const selCards = S.hands[0].filter((c) => sel.has(c.id));
    const selPlay = selCards.length ? analyze(selCards) : null;
    const canPlay = myTurn && selPlay && beats(selPlay, S.field, S.rev);
    const hand = h('div', { class: 'ct-hand', style: { '--n': S.hands[0].length } }, S.hands[0].map((c) => cardEl(c, {
      cls: `${sel.has(c.id) ? 'up' : ''} ${playable && !playable.has(c.id) ? 'dim' : ''}`,
      attrs: { role: 'button', onclick: () => {
        if (ex.pick) return ex.pick(c);
        if (!myTurn) return;
        if (sel.has(c.id)) sel.delete(c.id); else sel.add(c.id);
        sfx('tap'); render();
      } },
    })));
    const lp = S.field && S.lastPlay;
    const field = h('div', { class: `ct-field ${S.rev ? 'rev' : ''}` },
      S.rev ? h('span', { class: 'ct-rev' }, '革命中') : null,
      lp ? h('div', { class: `ct-play ${S.animated !== lp ? 'new' : ''}` }, lp.play.cards.map((c) => cardEl(c))) : h('span', { class: 'ct-empty' }, '場は空いています'),
      lp ? h('small', { class: 'ct-by' }, NAMES[lp.p]) : null,
      ex.got ? h('div', { class: 'ct-got' }, h('small', {}, 'もらったカード'), h('div', { class: 'ct-play' }, ex.got.map((c) => cardEl(c)))) : null);
    const actions = ex.actions || (myTurn ? [
      h('button', { class: 'btn', disabled: !S.field, onclick: humanPass }, 'パス'),
      h('button', { class: 'btn primary', disabled: !canPlay, onclick: humanPlay }, '出す'),
    ] : []);
    S.animated = lp;
    body.replaceChildren(
      h('div', { class: 'ct-table' }, seatEl(2), seatEl(1), field, seatEl(3)),
      h('p', { class: 'ct-msg' }, msg || (S.out.includes(0) ? `あなたは${titleOf(S.out.indexOf(0))}で上がりました` : myTurn ? (S.field ? '出すカードを選んでください' : '好きなカードを出せます') : '')),
      h('div', { class: 'ct-me' }, hand, h('div', { class: 'ct-actions' }, actions)));
  }

  showSetup();
  return () => { gen++; };
}
