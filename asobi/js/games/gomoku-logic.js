// 五目並べのルール (UI 非依存)。盤面は SIZE*SIZE、0 = 空、1 = 黒、2 = 白。
// rule: 'free' (五目以上で勝ち) / 'renju' (黒のみ三三・四四・長連が禁じ手、黒は五目ちょうどで勝ち)

export const SIZE = 15;
export const BLACK = 1;
export const WHITE = 2;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

const at = (board, r, c) => (r >= 0 && r < SIZE && c >= 0 && c < SIZE ? board[r * SIZE + c] : -1);

// (r, c) を通る dir 方向の連続した color の石の数と、その石の位置
function run(board, r, c, [dr, dc], color) {
  const cells = [r * SIZE + c];
  for (const s of [1, -1]) {
    let rr = r + dr * s, cc = c + dc * s;
    while (at(board, rr, cc) === color) {
      cells.push(rr * SIZE + cc);
      rr += dr * s; cc += dc * s;
    }
  }
  return cells;
}

// (r, c) に黒石がある前提で、dir 方向に 1 つ置けば (r, c) を含む五目ちょうどになる点
function fiveCompletions(board, r, c, dir) {
  const out = [];
  for (let k = -4; k <= 4; k++) {
    if (k === 0) continue;
    const rr = r + dir[0] * k, cc = c + dir[1] * k;
    if (at(board, rr, cc) !== 0) continue;
    board[rr * SIZE + cc] = BLACK;
    if (run(board, r, c, dir, BLACK).length === 5) out.push(k);
    board[rr * SIZE + cc] = 0;
  }
  return out;
}

const isStraightFour = (ks) => ks.length === 2 && Math.abs(ks[0] - ks[1]) === 5;

function fourCount(board, r, c, dir) {
  const ks = fiveCompletions(board, r, c, dir);
  if (isStraightFour(ks)) return 1;
  return Math.min(ks.length, 2);
}

function hasOpenThree(board, r, c, dir) {
  for (let k = -4; k <= 4; k++) {
    if (k === 0) continue;
    const rr = r + dir[0] * k, cc = c + dir[1] * k;
    if (at(board, rr, cc) !== 0) continue;
    board[rr * SIZE + cc] = BLACK;
    const straight = isStraightFour(fiveCompletions(board, r, c, dir));
    board[rr * SIZE + cc] = 0;
    if (straight) return true;
  }
  return false;
}

// 黒が idx に置いたときの禁じ手の種類。禁じ手でなければ null
export function forbiddenReason(board, idx) {
  if (board[idx] !== 0) return null;
  const r = Math.floor(idx / SIZE), c = idx % SIZE;
  board[idx] = BLACK;
  try {
    const lengths = DIRS.map((d) => run(board, r, c, d, BLACK).length);
    if (lengths.includes(5)) return null;
    if (lengths.some((n) => n > 5)) return '長連';
    let fours = 0, threes = 0;
    for (const d of DIRS) {
      fours += fourCount(board, r, c, d);
      if (hasOpenThree(board, r, c, d)) threes++;
    }
    if (fours >= 2) return '四四';
    if (threes >= 2) return '三三';
    return null;
  } finally {
    board[idx] = 0;
  }
}

// idx に color の石が置かれた盤面で勝ちが成立していれば、その五目の位置を返す
export function winningLine(board, idx, color, rule) {
  const r = Math.floor(idx / SIZE), c = idx % SIZE;
  for (const d of DIRS) {
    const cells = run(board, r, c, d, color);
    const exact = rule === 'renju' && color === BLACK;
    if (exact ? cells.length === 5 : cells.length >= 5) return cells.sort((a, b) => a - b);
  }
  return null;
}

export function initialState() {
  return { board: Array(SIZE * SIZE).fill(0), turn: BLACK, moves: [] };
}

export function play(state, idx, rule) {
  if (state.board[idx] !== 0) return { error: 'そこには置けません' };
  if (rule === 'renju' && state.turn === BLACK) {
    const reason = forbiddenReason(state.board, idx);
    if (reason) return { error: `禁じ手（${reason}）です` };
  }
  const board = state.board.slice();
  board[idx] = state.turn;
  const moves = [...state.moves, idx];
  const line = winningLine(board, idx, state.turn, rule);
  const full = moves.length === board.length;
  return {
    board,
    moves,
    turn: 3 - state.turn,
    winner: line ? state.turn : null,
    line,
    draw: !line && full,
  };
}
