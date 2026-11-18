// リバーシのルール (UI 非依存)。盤面は 64 マス、0 = 空、1 = 黒、2 = 白。

export const SIZE = 8;
export const BLACK = 1;
export const WHITE = 2;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export const other = (color) => 3 - color;

export function initialState() {
  const board = Array(SIZE * SIZE).fill(0);
  board[27] = WHITE; board[28] = BLACK;
  board[35] = BLACK; board[36] = WHITE;
  return { board, turn: BLACK, over: false };
}

export function flips(board, idx, color) {
  if (board[idx] !== 0) return [];
  const r = Math.floor(idx / SIZE), c = idx % SIZE;
  const out = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr * SIZE + cc] === other(color)) {
      line.push(rr * SIZE + cc);
      rr += dr; cc += dc;
    }
    if (line.length && rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr * SIZE + cc] === color) {
      out.push(...line);
    }
  }
  return out;
}

export function legalMoves(board, color) {
  const moves = [];
  for (let i = 0; i < board.length; i++) if (flips(board, i, color).length) moves.push(i);
  return moves;
}

export function count(board) {
  let black = 0, white = 0;
  for (const v of board) { if (v === BLACK) black++; else if (v === WHITE) white++; }
  return { black, white };
}

// 着手後の状態を返す。passed は次の手番がパスになったかどうか
export function play(state, idx) {
  const flipped = flips(state.board, idx, state.turn);
  if (!flipped.length) return null;
  const board = state.board.slice();
  board[idx] = state.turn;
  for (const f of flipped) board[f] = state.turn;
  const next = other(state.turn);
  if (legalMoves(board, next).length) return { board, turn: next, over: false, passed: false, flipped };
  if (legalMoves(board, state.turn).length) return { board, turn: state.turn, over: false, passed: true, flipped };
  return { board, turn: next, over: true, passed: false, flipped };
}
