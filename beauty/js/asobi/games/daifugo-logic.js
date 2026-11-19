// 大富豪のルールと CPU
// カード：{ id, s: 0-3（♠♥♦♣）| 4（ジョーカー）, r: 強さ 0-12（3,4,…,K,A,2）, j: true ならジョーカー }
// 出し方（play）：{ type: 'set'（同じ数字）| 'seq'（同じマークの階段）, n: 枚数, r: 強さ（階段はいちばん下）, cards, jokerOnly }

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
export const EIGHT = 5; // 8 の強さ

const rnd = (n) => Math.floor(Math.random() * n);
export const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function deck() {
  const d = [];
  for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) d.push({ id: `${s}-${r}`, s, r });
  d.push({ id: 'joker', s: 4, r: 13, j: true });
  return d;
}

export function deal() {
  const d = shuffle(deck()), hands = [[], [], [], []];
  d.forEach((c, i) => hands[i % 4].push(c));
  return hands.map(sortHand);
}

export const sortHand = (h) => h.slice().sort((a, b) => a.r - b.r || a.s - b.s);

// 選んだカードを「出し方」にする。出せない組み合わせなら null
export function analyze(cards) {
  const n = cards.length;
  if (!n) return null;
  const jokers = cards.filter((c) => c.j).length, rest = cards.filter((c) => !c.j);
  if (n === 1 && jokers === 1) return { type: 'set', n: 1, r: 13, cards, jokerOnly: true };
  // 同じ数字（ジョーカーは何の代わりにもなる）
  if (rest.length && rest.every((c) => c.r === rest[0].r)) return { type: 'set', n, r: rest[0].r, cards };
  // 階段：3 枚以上、同じマーク、続いた数字（ジョーカーで 1 つ抜けを埋められる）
  if (n >= 3 && rest.length && rest.every((c) => c.s === rest[0].s)) {
    const rs = rest.map((c) => c.r).sort((a, b) => a - b);
    if (new Set(rs).size !== rs.length) return null;
    const gaps = rs[rs.length - 1] - rs[0] + 1 - rs.length;
    if (gaps > jokers) return null;
    const spare = jokers - gaps;
    // 余ったジョーカーは上につける（上が 2 なら下に）
    let lo = rs[0];
    if (spare && rs[rs.length - 1] + spare > 12) lo = rs[0] - spare;
    if (lo < 0) return null;
    return { type: 'seq', n, r: lo, cards };
  }
  return null;
}

// 選べるルール（はじめる前に入れたり外したりできる）
export const RULE_LIST = [
  { k: 'rev', name: '革命', desc: '同じ数字を 4 枚出すと、強さが逆になる', on: true },
  { k: 'eight', name: '8切り', desc: '8 を出すと場が流れ、続けて出せる', on: true },
  { k: 'seven', name: '7渡し', desc: '7 を出したら、その枚数だけ次の人に好きなカードを渡す', on: false },
  { k: 'ten', name: '10捨て', desc: '10 を出したら、その枚数だけ好きなカードを捨てる', on: false },
  { k: 'spade3', name: 'スペ3', desc: 'ジョーカー 1 枚には ♠3 で返せる（場が流れる）', on: true },
  { k: 'jback', name: '11バック', desc: 'J を出すと、場が流れるまで強さが逆になる', on: false },
  { k: 'five', name: '5スキップ', desc: '5 を出すと、その枚数だけ次の人を飛ばす', on: false },
];
export const defaultRules = () => Object.fromEntries(RULE_LIST.map((r) => [r.k, r.on]));
// 出したカードの中の、ある数字の枚数（階段なら、その数字を通っていれば 1）
export function countRank(play, r) {
  if (!play || play.jokerOnly) return 0;
  if (play.type === 'set') return play.r === r ? play.n : 0;
  return play.r <= r && play.r + play.n - 1 >= r ? 1 : 0;
}
export const isSpade3 = (play) => play && play.type === 'set' && play.n === 1 && !play.jokerOnly && play.cards[0].s === 0 && play.cards[0].r === 0;

// play が場（field）に出せるか。rev = 強さが逆（革命・11バック）
export function beats(play, field, rev, R = {}) {
  if (!play) return false;
  if (!field) return true;
  if (play.type !== field.type || play.n !== field.n) return false;
  if (field.jokerOnly) return !!(R.spade3 && isSpade3(play)); // ジョーカー1枚には何も出せない（スペ3 だけ返せる）
  if (play.jokerOnly) return true; // ジョーカー1枚は、どの1枚にも勝つ（革命中も）
  return rev ? play.r < field.r : play.r > field.r;
}

export const hasEight = (play) => countRank(play, EIGHT) > 0;
export const isRevolution = (play) => play.type === 'set' && play.n >= 4;

// 手札から出せる出し方をすべて並べる
export function allPlays(hand) {
  const out = [], joker = hand.find((c) => c.j);
  const byRank = Array.from({ length: 13 }, () => []);
  hand.forEach((c) => { if (!c.j) byRank[c.r].push(c); });
  if (joker) out.push({ type: 'set', n: 1, r: 13, cards: [joker], jokerOnly: true });
  byRank.forEach((cs, r) => {
    for (let k = 1; k <= cs.length; k++) out.push({ type: 'set', n: k, r, cards: cs.slice(0, k) });
    if (joker && cs.length) out.push({ type: 'set', n: cs.length + 1, r, cards: [...cs, joker] });
  });
  for (let s = 0; s < 4; s++) {
    const has = Array.from({ length: 13 }, (_, r) => hand.find((c) => !c.j && c.s === s && c.r === r));
    for (let lo = 0; lo < 13; lo++) {
      let used = 0;
      const cards = [];
      for (let r = lo; r < 13; r++) {
        if (has[r]) cards.push(has[r]);
        else if (joker && !used) { used = 1; cards.push(joker); } else break;
        if (cards.length >= 3 && cards.some((c) => !c.j)) {
          const p = analyze(cards.slice());
          if (p) out.push(p);
        }
      }
    }
  }
  return out;
}

export const legalPlays = (hand, field, rev, R = {}) => allPlays(hand).filter((p) => beats(p, field, rev, R));

// 手札の弱さ（革命を起こすか決めるため）：強さの平均
const avgStrength = (hand) => hand.reduce((s, c) => s + (c.j ? 13 : c.r), 0) / Math.max(1, hand.length);

// CPU が何を出すか（null ならパス）
export function cpuPlay(hand, field, rev, level = 'normal', others = [], R = defaultRules()) {
  const plays = legalPlays(hand, field, rev, R);
  if (!plays.length) return null;
  if (level === 'easy') {
    if (field && Math.random() < 0.25) return null;
    return plays[rnd(plays.length)];
  }
  const weak = (p) => (rev ? 12 - p.r : p.r); // 革命中は数字が小さいほど強い
  const counts = Array(13).fill(0);
  hand.forEach((c) => { if (!c.j) counts[c.r]++; });
  // 組をくずす出し方は、なるべくしない
  const breaks = (p) => p.type === 'set' && !p.jokerOnly && p.cards.filter((c) => !c.j).length < counts[p.r];
  const usesJoker = (p) => p.cards.some((c) => c.j);
  const left = (p) => hand.length - p.n;
  const minOther = others.length ? Math.min(...others) : 99;
  const score = (p) => {
    let sc = weak(p) * 10;
    if (breaks(p)) sc += 35;
    if (usesJoker(p)) sc += p.jokerOnly ? 120 : 60;
    if (!field) sc -= p.n * 14; // 自分から出すときは、たくさん出せるものを先に
    if (left(p) === 0) sc -= 1000; // 上がれるなら上がる
    if (R.eight && hasEight(p) && !field) sc += 15; // 8 は場を流したいときにとっておく
    if (R.eight && hasEight(p) && field) sc -= 25;
    if (R.spade3 && isSpade3(p) && field && field.jokerOnly) sc -= 300; // ジョーカーにはスペ3 で返す
    if (R.seven) sc -= countRank(p, 4) * 8; // 7渡し・10捨ては手札が減るので少し出したい
    if (R.ten) sc -= countRank(p, 7) * 8;
    if (level === 'hard') {
      if (R.rev && isRevolution(p)) sc += avgStrength(hand) < 5.5 !== rev ? -200 : 200; // 手が弱いなら革命
      if (minOther <= 2 && field) sc -= weak(p) * 6; // だれかが上がりそうなら強いので止める
    } else if (R.rev && isRevolution(p)) sc += 60;
    return sc;
  };
  plays.sort((a, b) => score(a) - score(b));
  const best = plays[0];
  if (field && left(best) > 0) {
    // 強いカードしか出せないときは、ときどき見送る
    const strong = weak(best) >= 11 || usesJoker(best);
    const holdChance = level === 'hard' ? (minOther <= 2 ? 0 : 0.7) : 0.4;
    if (strong && hand.length > 3 && Math.random() < holdChance) return null;
  }
  return best;
}

// 交換：上の人は弱いカードを、下の人は強いカードを渡す
export const strongest = (hand, k) => hand.slice().sort((a, b) => (b.j ? 99 : b.r) - (a.j ? 99 : a.r)).slice(0, k);
export const weakest = (hand, k) => hand.slice().sort((a, b) => (a.j ? 99 : a.r) - (b.j ? 99 : b.r)).slice(0, k);

export const TITLES = ['大富豪', '富豪', '平民', '貧民', '大貧民'];
// 4 人のときの順位 → 呼び名（1 位 大富豪 / 2 位 富豪 / 3 位 貧民 / 4 位 大貧民）
export const titleOf = (place) => ['大富豪', '富豪', '貧民', '大貧民'][place];
