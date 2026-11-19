// カードの卓（大富豪・いろあわせ）：扇に開いた手札、相手の裏向きの扇、場に出たカード
import { h } from '../ui.js';

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

// 数札のマークの位置（x, y は % 。y > 50 は逆さに描く）
const PIPS = {
  1: [[50, 50]],
  2: [[50, 14], [50, 86]],
  3: [[50, 14], [50, 50], [50, 86]],
  4: [[28, 14], [72, 14], [28, 86], [72, 86]],
  5: [[28, 14], [72, 14], [50, 50], [28, 86], [72, 86]],
  6: [[28, 14], [72, 14], [28, 50], [72, 50], [28, 86], [72, 86]],
  7: [[28, 14], [72, 14], [50, 32], [28, 50], [72, 50], [28, 86], [72, 86]],
  8: [[28, 14], [72, 14], [50, 32], [28, 50], [72, 50], [50, 68], [28, 86], [72, 86]],
  9: [[28, 14], [72, 14], [28, 38], [72, 38], [50, 50], [28, 62], [72, 62], [28, 86], [72, 86]],
  10: [[28, 14], [72, 14], [50, 26], [28, 38], [72, 38], [28, 62], [72, 62], [50, 74], [28, 86], [72, 86]],
};
const PIP_COUNT = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'A': 1 };

// 絵札（J・Q・K）：上下対称の札。冠・髪飾り・羽根の形はこの遊のための図案
const COURT = {
  K: '<path d="M8 22 6 9l6 6 4-9 4 9 6-6-2 13z"/><path d="M8 25h16" />',
  Q: '<path d="M7 21c2-7 5-11 9-13 4 2 7 6 9 13"/><circle cx="16" cy="6" r="2.4"/><circle cx="9" cy="13" r="1.6"/><circle cx="23" cy="13" r="1.6"/><path d="M7 24h18"/>',
  J: '<path d="M10 24c0-9 3-15 10-19-2 5-2 9 1 12-3-1-5 0-6 2 3 0 5 1 6 3"/><path d="M8 26h16"/>',
};

// トランプ 1 枚
export function playingCard(c, { cls = '', attrs = {} } = {}) {
  if (c.j) {
    return h('span', { class: `pc2 joker ${cls}`, ...attrs },
      h('span', { class: 'pc2-ix' }, h('b', {}, 'J'), h('i', {}, '★')),
      h('span', { class: 'pc2-jk' }, h('i', {}, '★'), h('em', {}, 'JOKER')),
      h('span', { class: 'pc2-ix rot' }, h('b', {}, 'J'), h('i', {}, '★')));
  }
  const r = RANKS[c.r], s = SUITS[c.s], red = c.s === 1 || c.s === 2;
  let mid;
  if (PIP_COUNT[r]) {
    const n = PIP_COUNT[r];
    mid = h('span', { class: `pc2-pips n${n}` }, PIPS[n].map(([x, y]) => h('i', { style: { left: x + '%', top: y + '%' }, class: y > 55 ? 'dn' : '' }, s)));
  } else {
    mid = h('span', { class: 'pc2-court', html:
      `<span class="half"><svg viewBox="0 0 32 28" aria-hidden="true">${COURT[r]}</svg><b>${r}</b><i>${s}</i></span>`
      + `<span class="half dn"><svg viewBox="0 0 32 28" aria-hidden="true">${COURT[r]}</svg><b>${r}</b><i>${s}</i></span>` });
  }
  return h('span', { class: `pc2 ${red ? 'red' : ''} ${r === 'A' ? 'ace' : ''} ${cls}`, ...attrs },
    h('span', { class: 'pc2-ix' }, h('b', {}, r), h('i', {}, s)),
    mid,
    h('span', { class: 'pc2-ix rot' }, h('b', {}, r), h('i', {}, s)));
}

// 裏向きの札
export const backCard = (kind = 'kc') => h('span', { class: `cb2 ${kind}` }, h('i'));

// 手札の扇：カードを、ずっと下にある 1 点を中心に少しずつ回して並べる
export function fanHand(cards, width, { cw = 64, ch = 92, maxStep = 7 } = {}) {
  const n = cards.length;
  const R = ch * 5.4; // 回す中心までの距離
  const half = Math.max(40, (width - cw - 20) / 2);
  const total = 2 * Math.asin(Math.min(1, half / R)) * 180 / Math.PI; // 画面の幅に収まる角度
  const step = n > 1 ? Math.min(maxStep, total / (n - 1)) : 0;
  const el = h('div', { class: 'fan2', style: { '--cw': cw + 'px', '--ch': ch + 'px', '--R': R + 'px' } });
  cards.forEach((card, i) => {
    const a = (i - (n - 1) / 2) * step;
    card.style.setProperty('--a', a.toFixed(2) + 'deg');
    card.style.zIndex = String(i + 1);
    card.classList.add('in-fan');
    el.append(card);
  });
  return el;
}

// 相手の裏向きの扇（上・左・右）
export function backFan(n, where, kind) {
  const k = Math.min(n, 13);
  const el = h('div', { class: `bfan2 ${where}` });
  for (let i = 0; i < k; i++) {
    const b = backCard(kind);
    b.style.setProperty('--a', ((i - (k - 1) / 2) * (where === 's-top' ? 5.5 : 4.2)).toFixed(1) + 'deg');
    el.append(b);
  }
  return el;
}

// 名札：名前・残りの枚数・肩書き・ひとこと
export function plate({ name, sub, badge, say, turn, done, where }) {
  return h('div', { class: `pl2 ${where} ${turn ? 'turn' : ''} ${done ? 'done' : ''}` },
    badge ? h('span', { class: 'pl2-badge' }, badge) : null,
    h('b', {}, name),
    h('small', {}, sub),
    say ? h('span', { class: 'pl2-say' }, say) : null);
}

// 場に出たカードを、少しずつ傾けて重ねる（傾きはカードごとに決まっていて、描き直しても動かない）
export function spread(cards, mk) {
  const n = cards.length;
  return h('div', { class: 'spread2' }, cards.map((c, i) => {
    const seed = String(c.id).split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);
    const el = mk(c);
    el.style.setProperty('--a', ((i - (n - 1) / 2) * 9 + ((seed % 7) - 3)).toFixed(1) + 'deg');
    el.style.setProperty('--x', ((i - (n - 1) / 2) * 30) + 'px');
    return el;
  }));
}
