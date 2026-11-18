// CPU（ひとりで遊ぶときの相手）の考え方。画面には依存しない。
// どれも level: 'easy' | 'normal' | 'hard' で強さを変える。
import * as R from './games/reversi-logic.js';
import * as G from './games/gomoku-logic.js';
import * as C from './games/chess-logic.js';
import * as S from './games/minishogi-logic.js';
import * as Y from './games/yacht-logic.js';
import * as HB from './games/hitblow-logic.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
// 時間を区切る（つよいでも iPhone が固まらないように）
const deadline = (ms) => { const end = Date.now() + ms; return () => Date.now() > end; };

// ───────── リバーシ：角・辺の重みと、打てる場所の多さで先を読む ─────────
const RV_W = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];
function rvEval(state, me) {
  const b = state.board;
  if (state.over) { const { black, white } = R.count(b); const d = me === R.BLACK ? black - white : white - black; return d > 0 ? 1e6 + d : d < 0 ? -1e6 + d : 0; }
  let pos = 0, empty = 0;
  for (let i = 0; i < 64; i++) { if (b[i] === me) pos += RV_W[i]; else if (b[i]) pos -= RV_W[i]; else empty++; }
  const mob = R.legalMoves(b, me).length - R.legalMoves(b, R.other(me)).length;
  if (empty < 12) { const { black, white } = R.count(b); pos += 6 * (me === R.BLACK ? black - white : white - black); }
  return pos + 8 * mob;
}
function rvSearch(state, depth, alpha, beta, me, late) {
  if (depth === 0 || state.over || late()) return rvEval(state, me);
  const moves = R.legalMoves(state.board, state.turn);
  const maxing = state.turn === me;
  let best = maxing ? -Infinity : Infinity;
  for (const m of moves) {
    const v = rvSearch(R.play(state, m), depth - 1, alpha, beta, me, late);
    if (maxing) { if (v > best) best = v; if (v > alpha) alpha = v; } else { if (v < best) best = v; if (v < beta) beta = v; }
    if (alpha >= beta) break;
  }
  return best;
}
export function reversiMove(state, level = 'normal') {
  const me = state.turn, moves = R.legalMoves(state.board, me);
  if (!moves.length) return null;
  const empty = state.board.filter((v) => !v).length;
  const depth = level === 'easy' ? 1 : level === 'normal' ? 3 : empty <= 10 ? empty : 5;
  const late = deadline(level === 'hard' ? 1500 : 600);
  const scored = moves.map((m) => ({ m, v: rvSearch(R.play(state, m), depth - 1, -Infinity, Infinity, me, late) }));
  scored.sort((a, b) => b.v - a.v);
  if (level === 'easy' && Math.random() < 0.45) return pick(scored.slice(0, Math.min(4, scored.length))).m;
  return scored[0].m;
}

// ───────── 五目並べ：四・三をつくる／止める点数で選ぶ ─────────
const N = G.SIZE, DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
function lineScore(board, idx, color) {
  const r = Math.floor(idx / N), c = idx % N;
  let total = 0, fours = 0, threes = 0;
  for (const [dr, dc] of DIRS) {
    let count = 1, open = 0;
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s, k = 0;
      while (rr >= 0 && rr < N && cc >= 0 && cc < N && board[rr * N + cc] === color) { count++; rr += dr * s; cc += dc * s; k++; }
      if (rr >= 0 && rr < N && cc >= 0 && cc < N && board[rr * N + cc] === 0) open++;
    }
    if (count >= 5) total += 1e7;
    else if (count === 4) { total += open === 2 ? 1e6 : open === 1 ? 5e4 : 0; fours++; }
    else if (count === 3) { total += open === 2 ? 2e4 : open === 1 ? 800 : 0; if (open === 2) threes++; }
    else if (count === 2) total += open === 2 ? 400 : open === 1 ? 60 : 0;
    else total += open * 8;
  }
  if (fours >= 2 || (fours && threes)) total += 5e5; // 四四・四三
  if (threes >= 2) total += 8e4; // 三三
  return total;
}
export function gomokuMove(state, rule = 'free', level = 'normal') {
  const board = state.board, me = state.turn, you = 3 - me;
  if (!state.moves.length) return Math.floor(N / 2) * N + Math.floor(N / 2);
  // 置いてある石のまわり 2 マスの空き点だけを考える
  const cand = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i]) continue;
    const r = Math.floor(i / N), c = i % N;
    let near = false;
    for (let dr = -2; dr <= 2 && !near; dr++) for (let dc = -2; dc <= 2; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < N && cc >= 0 && cc < N && board[rr * N + cc]) { near = true; break; }
    }
    if (!near) continue;
    if (rule === 'renju' && me === G.BLACK && G.forbiddenReason(board, i)) continue;
    cand.push(i);
  }
  const defend = level === 'easy' ? 0.55 : level === 'normal' ? 0.92 : 1.05;
  const scored = cand.map((i) => {
    const b = board.slice();
    b[i] = me; const atk = lineScore(b, i, me);
    b[i] = you; const def = lineScore(b, i, you);
    return { i, v: atk + def * defend + Math.random() * (level === 'easy' ? 600 : 20) };
  }).sort((a, b) => b.v - a.v);
  if (!scored.length) return board.findIndex((v) => !v);
  if (level !== 'hard') return scored[0].i;
  // つよい：上位の手について、相手のいちばんの返しまで読む
  let best = scored[0].i, bestV = -Infinity;
  for (const { i, v } of scored.slice(0, 8)) {
    if (v >= 1e7) return i;
    const b = board.slice(); b[i] = me;
    let reply = 0;
    for (let j = 0; j < b.length; j++) {
      if (b[j]) continue;
      b[j] = you; const t = lineScore(b, j, you); b[j] = 0;
      if (t > reply) reply = t;
    }
    const net = v - reply * 0.8;
    if (net > bestV) { bestV = net; best = i; }
  }
  return best;
}

// ───────── チェス：駒の価値と位置で先を読む（αβ） ─────────
const CV = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const CENTER = Array.from({ length: 64 }, (_, i) => { const r = i >> 3, c = i & 7; return 14 - 2 * (Math.abs(3.5 - r) + Math.abs(3.5 - c)); });
function chEval(state, me) {
  let v = 0;
  state.board.forEach((p, i) => {
    if (!p) return;
    let x = CV[p.t];
    if (p.t === 'n' || p.t === 'b') x += CENTER[i];
    if (p.t === 'p') x += (p.c === 'w' ? 6 - (i >> 3) : (i >> 3) - 1) * 6 + CENTER[i] / 3;
    v += p.c === me ? x : -x;
  });
  return v;
}
function chOrder(state, moves) {
  return moves.map((m) => ({ m, k: (state.board[m.to] ? CV[state.board[m.to].t] * 10 - CV[state.board[m.from].t] : 0) + (m.promo ? 800 : 0) })).sort((a, b) => b.k - a.k).map((x) => x.m);
}
function chSearch(state, depth, alpha, beta, me, late) {
  const moves = C.legalMoves(state);
  if (!moves.length) return C.inCheck(state) ? (state.turn === me ? -1e6 - depth : 1e6 + depth) : 0;
  if (depth === 0 || late()) return chEval(state, me);
  const maxing = state.turn === me;
  let best = maxing ? -Infinity : Infinity;
  for (const m of chOrder(state, moves)) {
    const v = chSearch(C.makeMove(state, m), depth - 1, alpha, beta, me, late);
    if (maxing) { if (v > best) best = v; if (v > alpha) alpha = v; } else { if (v < best) best = v; if (v < beta) beta = v; }
    if (alpha >= beta) break;
  }
  return best;
}
export function chessMove(state, level = 'normal') {
  const me = state.turn, moves = C.legalMoves(state);
  if (!moves.length) return null;
  const depth = level === 'easy' ? 1 : level === 'normal' ? 2 : 3;
  const late = deadline(level === 'hard' ? 2500 : 900);
  const scored = chOrder(state, moves).map((m) => ({ m, v: chSearch(C.makeMove(state, m), depth - 1, -Infinity, Infinity, me, late) + Math.random() * (level === 'easy' ? 120 : 6) }));
  scored.sort((a, b) => b.v - a.v);
  return scored[0].m;
}

// ───────── 5五将棋：持ち駒と成りも入れて先を読む ─────────
const SV = { K: 0, G: 600, S: 500, B: 750, R: 900, P: 120 };
const SVP = { S: 600, B: 1000, R: 1150, P: 520 };
function shEval(state, me) {
  let v = 0;
  state.board.forEach((p) => { if (!p) return; const x = p.p ? SVP[p.t] : SV[p.t]; v += p.o === me ? x : -x; });
  for (const o of [0, 1]) for (const t of S.HAND_ORDER) v += (o === me ? 1 : -1) * (state.hands[o][t] || 0) * SV[t] * 1.1;
  return v;
}
function shSearch(state, depth, alpha, beta, me, late) {
  const moves = S.legalMoves(state);
  if (!moves.length) return state.turn === me ? -1e6 - depth : 1e6 + depth;
  if (depth === 0 || late()) return shEval(state, me);
  const maxing = state.turn === me;
  let best = maxing ? -Infinity : Infinity;
  const ordered = moves.map((m) => ({ m, k: (!m.drop && state.board[m.to] ? SV[state.board[m.to].t] : 0) + (m.promote ? 300 : 0) })).sort((a, b) => b.k - a.k).map((x) => x.m);
  for (const m of ordered) {
    const v = shSearch(S.makeMove(state, m), depth - 1, alpha, beta, me, late);
    if (maxing) { if (v > best) best = v; if (v > alpha) alpha = v; } else { if (v < best) best = v; if (v < beta) beta = v; }
    if (alpha >= beta) break;
  }
  return best;
}
export function shogiMove(state, level = 'normal') {
  const me = state.turn, moves = S.legalMoves(state);
  if (!moves.length) return null;
  const depth = level === 'easy' ? 1 : level === 'normal' ? 2 : 3;
  const late = deadline(level === 'hard' ? 2500 : 900);
  const scored = moves.map((m) => ({ m, v: shSearch(S.makeMove(state, m), depth - 1, -Infinity, Infinity, me, late) + Math.random() * (level === 'easy' ? 150 : 6) }));
  scored.sort((a, b) => b.v - a.v);
  return scored[0].m;
}

// ───────── ヨット：どのサイコロを残すか・どの欄に入れるか ─────────
// 欄ごとの「入れたときのうれしさ」：点数から、その欄の平均的な値打ちを引いたもの（上段はボーナスへの近さも見る）
const AVG = { ones: 2.1, twos: 4.2, threes: 6.3, fours: 8.4, fives: 10.5, sixes: 12.6, choice: 22, four: 8, full: 10, sstraight: 9, lstraight: 7, yacht: 4 };
function catValue(sheet, id, dice) {
  const sc = Y.score(id, dice), cat = Y.CATEGORIES.find((c) => c.id === id);
  let v = sc - (AVG[id] ?? 5);
  if (cat.face) {
    const par = cat.face * 3, t = Y.totals(sheet);
    if (t.upper < Y.BONUS_THRESHOLD) v += (sc - par) * 0.9; // 63点のボーナスに向けて、3つ以上そろえたら加点
  }
  if (id === 'choice') v -= 4; // チョイスは最後の逃げ場として取っておく
  return v;
}
export function yachtCategory(sheet, dice, level = 'normal') {
  const open = Y.CATEGORIES.filter((c) => !(c.id in sheet)).map((c) => c.id);
  const scored = open.map((id) => ({ id, v: catValue(sheet, id, dice) + (level === 'easy' ? Math.random() * 10 : 0) })).sort((a, b) => b.v - a.v);
  return scored[0].id;
}
// 振り直しの期待値（サンプルで見積もる）
function bestAfter(sheet, dice, held, rollsLeft, samples) {
  let sum = 0;
  for (let k = 0; k < samples; k++) {
    const d = dice.map((v, i) => (held[i] ? v : 1 + Math.floor(Math.random() * 6)));
    const open = Y.CATEGORIES.filter((c) => !(c.id in sheet)).map((c) => c.id);
    let best = -Infinity;
    for (const id of open) best = Math.max(best, catValue(sheet, id, d));
    if (rollsLeft > 1) best = Math.max(best, best * 0.6 + 0.4 * keepScore(sheet, d)); // もう一回振れるぶんの上乗せ（ざっくり）
    sum += best;
  }
  return sum / samples;
}
const keepScore = (sheet, d) => { const open = Y.CATEGORIES.filter((c) => !(c.id in sheet)).map((c) => c.id); return Math.max(...open.map((id) => catValue(sheet, id, d))); };
// → 残すサイコロ（true/false の配列）。振らずに記入するなら null
export function yachtHold(sheet, dice, rollsLeft, level = 'normal') {
  const stand = keepScore(sheet, dice);
  if (level === 'easy') {
    // やさしい：いちばん多い目だけ残す
    const cnt = {}; dice.forEach((v) => { cnt[v] = (cnt[v] || 0) + 1; });
    const face = Number(Object.entries(cnt).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]);
    return stand > 12 ? null : dice.map((v) => v === face);
  }
  const samples = level === 'hard' ? 220 : 90;
  let best = null, bestV = stand + (level === 'hard' ? 0.5 : 1.5);
  for (let mask = 0; mask < 31; mask++) {
    const held = dice.map((_, i) => !!(mask & (1 << i)));
    const v = bestAfter(sheet, dice, held, rollsLeft, samples);
    if (v > bestV) { bestV = v; best = held; }
  }
  return best;
}

// ───────── ヒット&ブロー：ありえる答えを覚えておき、絞りこめる手を出す ─────────
export function allCodes({ length, colors, duplicates }) {
  const out = [];
  const rec = (cur) => {
    if (cur.length === length) { out.push(cur.slice()); return; }
    for (let c = 0; c < colors; c++) { if (!duplicates && cur.includes(c)) continue; cur.push(c); rec(cur); cur.pop(); }
  };
  rec([]);
  return out;
}
// history: [{ guess, hit, blow }]。ありえる答えの中から次に出す手
export function hitblowGuess(opts, history, level = 'normal') {
  let pool = allCodes(opts).filter((code) => history.every((h) => { const j = HB.judge(code, h.guess); return j.hit === h.hit && j.blow === h.blow; }));
  if (!pool.length) return allCodes(opts)[0];
  if (level === 'easy') {
    // やさしい：最初の2手はでたらめ、あとはありえる答えから
    if (history.length < 2) return pick(allCodes(opts));
    return pick(pool);
  }
  if (level === 'normal' || pool.length > 400) return pick(pool);
  // つよい：答えの候補を最もよく分ける手（いちばん多く残る場合が少ないもの）
  let best = pool[0], bestWorst = Infinity;
  for (const g of pool.slice(0, 250)) {
    const buckets = new Map();
    for (const code of pool) { const j = HB.judge(code, g); const k = j.hit * 10 + j.blow; buckets.set(k, (buckets.get(k) || 0) + 1); }
    const worst = Math.max(...buckets.values());
    if (worst < bestWorst) { bestWorst = worst; best = g; }
  }
  return best;
}
export function randomCode(opts) { return pick(allCodes(opts)); }
