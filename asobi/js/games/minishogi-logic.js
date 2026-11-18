// 5五将棋のルール (UI 非依存)
// 盤面は 25 マス。index = row * 5 + col、row 0 が後手の陣 (上)、col 0 が 5 筋 (左)。
// 駒は { o: 0 (先手) | 1 (後手), t: 'K' | 'G' | 'S' | 'B' | 'R' | 'P', p: 成っているか }。

export const SIZE = 5;
export const HAND_ORDER = ['R', 'B', 'G', 'S', 'P'];
const PROMOTABLE = new Set(['S', 'B', 'R', 'P']);

const ALL8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const GOLD = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]];
const SILVER = [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]];
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const lastRow = (owner) => (owner === 0 ? 0 : SIZE - 1);
// 5五将棋の敵陣は最奥の1段のみ
const inZone = (owner, row) => row === lastRow(owner);

export function pieceLabel(piece) {
  if (piece.p) return { S: '全', B: '馬', R: '龍', P: 'と' }[piece.t];
  if (piece.t === 'K') return piece.o === 0 ? '玉' : '王';
  return { G: '金', S: '銀', B: '角', R: '飛', P: '歩' }[piece.t];
}

export function initialState() {
  const board = Array(SIZE * SIZE).fill(null);
  'KGSBR'.split('').forEach((t, c) => { board[20 + c] = { o: 0, t, p: false }; });
  board[15] = { o: 0, t: 'P', p: false };
  'RBSGK'.split('').forEach((t, c) => { board[c] = { o: 1, t, p: false }; });
  board[9] = { o: 1, t: 'P', p: false };
  return { board, hands: [emptyHand(), emptyHand()], turn: 0 };
}

const emptyHand = () => ({ R: 0, B: 0, G: 0, S: 0, P: 0 });

// 駒の利き: [step 方向の配列, slide 方向の配列] (先手視点の方向に owner を反映済み)
function movement(piece) {
  const flip = (dirs) => (piece.o === 0 ? dirs : dirs.map(([dr, dc]) => [-dr, -dc]));
  if (piece.t === 'K') return [ALL8, []];
  if (piece.t === 'G' || (piece.p && (piece.t === 'S' || piece.t === 'P'))) return [flip(GOLD), []];
  if (piece.t === 'S') return [flip(SILVER), []];
  if (piece.t === 'P') return [flip([[-1, 0]]), []];
  if (piece.t === 'B') return [piece.p ? ORTHO : [], DIAG];
  if (piece.t === 'R') return [piece.p ? DIAG : [], ORTHO];
  return [[], []];
}

function targets(board, sq) {
  const piece = board[sq];
  const r = Math.floor(sq / SIZE), c = sq % SIZE;
  const [steps, slides] = movement(piece);
  const out = [];
  for (const [dr, dc] of steps) {
    if (inside(r + dr, c + dc)) out.push((r + dr) * SIZE + c + dc);
  }
  for (const [dr, dc] of slides) {
    let rr = r + dr, cc = c + dc;
    while (inside(rr, cc)) {
      out.push(rr * SIZE + cc);
      if (board[rr * SIZE + cc]) break;
      rr += dr; cc += dc;
    }
  }
  return out;
}

export function attacked(board, sq, byOwner) {
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (p && p.o === byOwner && targets(board, i).includes(sq)) return true;
  }
  return false;
}

export function kingSquare(board, owner) {
  return board.findIndex((p) => p && p.o === owner && p.t === 'K');
}

export function inCheck(state, owner = state.turn) {
  return attacked(state.board, kingSquare(state.board, owner), 1 - owner);
}

function pseudoMoves(state) {
  const { board, hands, turn } = state;
  const moves = [];
  for (let sq = 0; sq < board.length; sq++) {
    const p = board[sq];
    if (!p || p.o !== turn) continue;
    const fromRow = Math.floor(sq / SIZE);
    for (const to of targets(board, sq)) {
      if (board[to] && board[to].o === turn) continue;
      const toRow = Math.floor(to / SIZE);
      const canPromote = PROMOTABLE.has(p.t) && !p.p && (inZone(turn, fromRow) || inZone(turn, toRow));
      const mustPromote = p.t === 'P' && !p.p && toRow === lastRow(turn);
      if (!mustPromote) moves.push({ from: sq, to, promote: false });
      if (canPromote) moves.push({ from: sq, to, promote: true });
    }
  }
  for (const t of HAND_ORDER) {
    if (!hands[turn][t]) continue;
    for (let to = 0; to < board.length; to++) {
      if (board[to]) continue;
      if (t === 'P') {
        const row = Math.floor(to / SIZE), col = to % SIZE;
        if (row === lastRow(turn)) continue;
        // 二歩
        let nifu = false;
        for (let rr = 0; rr < SIZE; rr++) {
          const q = board[rr * SIZE + col];
          if (q && q.o === turn && q.t === 'P' && !q.p) nifu = true;
        }
        if (nifu) continue;
      }
      moves.push({ drop: t, to });
    }
  }
  return moves;
}

export function makeMove(state, m) {
  const board = state.board.slice();
  const hands = [{ ...state.hands[0] }, { ...state.hands[1] }];
  const turn = state.turn;
  let captured = null;
  if (m.drop) {
    board[m.to] = { o: turn, t: m.drop, p: false };
    hands[turn][m.drop]--;
  } else {
    const piece = board[m.from];
    captured = board[m.to];
    if (captured) hands[turn][captured.t]++;
    board[m.to] = m.promote ? { ...piece, p: true } : piece;
    board[m.from] = null;
  }
  return { board, hands, turn: 1 - turn, captured };
}

function hasLegalMove(state) {
  return pseudoMoves(state).some((m) => isSafe(state, m));
}

function isSafe(state, m) {
  const next = makeMove(state, m);
  return !attacked(next.board, kingSquare(next.board, state.turn), next.turn);
}

export function legalMoves(state) {
  return pseudoMoves(state).filter((m) => {
    if (!isSafe(state, m)) return false;
    if (m.drop === 'P') {
      // 打ち歩詰め
      const next = makeMove(state, m);
      if (inCheck(next) && !hasLegalMove(next)) return false;
    }
    return true;
  });
}

export function positionKey(state) {
  let s = '';
  for (const p of state.board) {
    s += p ? (p.o === 0 ? p.t : p.t.toLowerCase()) + (p.p ? '+' : ' ') : '. ';
  }
  for (const hand of state.hands) s += '|' + HAND_ORDER.map((t) => hand[t]).join('');
  return s + state.turn;
}

// history: 初期局面からの { key, check } の配列 (現在局面を含む)。
// check は「その局面で手番側が王手されているか」。
export function gameStatus(state, history = []) {
  const moves = legalMoves(state);
  if (moves.length === 0) {
    return { over: true, winner: 1 - state.turn, reason: inCheck(state) ? '詰み' : '指せる手がない' };
  }
  const current = history[history.length - 1];
  if (current) {
    const same = history.map((h, i) => (h.key === current.key ? i : -1)).filter((i) => i >= 0);
    if (same.length >= 4) {
      // 連続王手の千日手は王手をかけていた側の負け、それ以外は先手の負け
      const span = history.slice(same[0] + 1);
      for (const attacker of [0, 1]) {
        const defenderTurns = span.filter((h) => h.turn === 1 - attacker);
        if (defenderTurns.length > 0 && defenderTurns.every((h) => h.check)) {
          return { over: true, winner: 1 - attacker, reason: '連続王手の千日手' };
        }
      }
      return { over: true, winner: 1, reason: '千日手 (先手の負け)' };
    }
  }
  return { over: false, check: inCheck(state), moves };
}

export function perft(state, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(state);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(makeMove(state, m), depth - 1);
  return n;
}
