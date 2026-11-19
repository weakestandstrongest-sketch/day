// 数独の問題づくり：答えをでたらめに作り、答えが1つに決まるかぎり数字を抜いていく
// 盤は長さ 81 の配列（0 = 空き）

const rnd = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const rowOf = (i) => Math.floor(i / 9);
export const colOf = (i) => i % 9;
export const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

// i のマスと同じ行・列・ブロックのマス（自分は入れない）
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const s = new Set();
  for (let k = 0; k < 81; k++) if (k !== i && (rowOf(k) === rowOf(i) || colOf(k) === colOf(i) || boxOf(k) === boxOf(i))) s.add(k);
  return [...s];
});

export function canPlace(b, i, v) {
  for (const p of PEERS[i]) if (b[p] === v) return false;
  return true;
}

// 答えの数を数える（limit まで）。候補の少ないマスから埋める
function countSolutions(b, limit = 2) {
  let best = -1, bestOpts = null;
  for (let i = 0; i < 81; i++) {
    if (b[i]) continue;
    const opts = [];
    for (let v = 1; v <= 9; v++) if (canPlace(b, i, v)) opts.push(v);
    if (!opts.length) return 0;
    if (!bestOpts || opts.length < bestOpts.length) { best = i; bestOpts = opts; if (opts.length === 1) break; }
  }
  if (best < 0) return 1;
  let n = 0;
  for (const v of bestOpts) {
    b[best] = v;
    n += countSolutions(b, limit - n);
    b[best] = 0;
    if (n >= limit) break;
  }
  return n;
}

function fill(b) {
  const i = b.indexOf(0);
  if (i < 0) return true;
  for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (!canPlace(b, i, v)) continue;
    b[i] = v;
    if (fill(b)) return true;
  }
  b[i] = 0;
  return false;
}

// 残すヒントの数（だいたい）：やさしい 40・ふつう 32・むずかしい 26 前後
export const LEVELS = { easy: { name: 'やさしい', clues: 40 }, normal: { name: 'ふつう', clues: 32 }, hard: { name: 'むずかしい', clues: 25 } };

export function generate(level = 'normal') {
  const solution = Array(81).fill(0);
  fill(solution);
  const puzzle = solution.slice();
  const target = (LEVELS[level] || LEVELS.normal).clues;
  let filled = 81;
  // 点対称に2つずつ抜く（見た目がきれい）。抜いて答えが2つになるなら戻す
  for (const i of shuffle([...Array(41).keys()])) {
    if (filled <= target) break;
    const j = 80 - i;
    const a = puzzle[i], c = puzzle[j];
    puzzle[i] = 0; puzzle[j] = 0;
    if (countSolutions(puzzle.slice()) !== 1) { puzzle[i] = a; puzzle[j] = c; continue; }
    filled -= i === j ? 1 : 2;
  }
  return { puzzle, solution };
}
