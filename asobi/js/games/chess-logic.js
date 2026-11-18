// チェスのルール (UI 非依存)
// 盤面は 64 マス。index = row * 8 + col、row 0 が 8 段目 (黒側)。
// 駒は { c: 'w' | 'b', t: 'p' | 'n' | 'b' | 'r' | 'q' | 'k' }。

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const other = (color) => (color === 'w' ? 'b' : 'w');

export function initialState() {
  return fromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
}

export function fromFEN(fen) {
  const [placement, turn, castle, ep, half, full] = fen.trim().split(/\s+/);
  const board = Array(64).fill(null);
  let idx = 0;
  for (const ch of placement) {
    if (ch === '/') continue;
    if (/\d/.test(ch)) { idx += Number(ch); continue; }
    const lower = ch.toLowerCase();
    board[idx++] = { c: ch === lower ? 'b' : 'w', t: lower };
  }
  return {
    board,
    turn: turn === 'b' ? 'b' : 'w',
    castling: {
      wK: castle.includes('K'), wQ: castle.includes('Q'),
      bK: castle.includes('k'), bQ: castle.includes('q'),
    },
    ep: ep && ep !== '-' ? squareIndex(ep) : null,
    half: Number(half) || 0,
    full: Number(full) || 1,
  };
}

export function squareIndex(name) {
  const col = name.charCodeAt(0) - 97;
  const row = 8 - Number(name[1]);
  return row * 8 + col;
}

export function squareName(idx) {
  return String.fromCharCode(97 + (idx & 7)) + (8 - (idx >> 3));
}

function isPiece(p, color, type) {
  return p !== null && p.c === color && p.t === type;
}

// sq が color 側の駒に利かされているか
export function attacked(board, sq, color) {
  const r = sq >> 3, c = sq & 7;
  // ポーン: 白ポーンは上 (row - 1) 方向に取るので、攻撃元は一段下
  const pr = color === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    if (inside(pr, c + dc) && isPiece(board[pr * 8 + c + dc], color, 'p')) return true;
  }
  for (const [dr, dc] of KNIGHT) {
    if (inside(r + dr, c + dc) && isPiece(board[(r + dr) * 8 + c + dc], color, 'n')) return true;
  }
  for (const [dr, dc] of KING) {
    if (inside(r + dr, c + dc) && isPiece(board[(r + dr) * 8 + c + dc], color, 'k')) return true;
  }
  const slide = (dirs, types) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inside(rr, cc)) {
        const p = board[rr * 8 + cc];
        if (p) {
          if (p.c === color && types.includes(p.t)) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return false;
  };
  return slide(ROOK_DIRS, 'rq') || slide(BISHOP_DIRS, 'bq');
}

export function kingSquare(board, color) {
  return board.findIndex((p) => isPiece(p, color, 'k'));
}

export function inCheck(state, color = state.turn) {
  return attacked(state.board, kingSquare(state.board, color), other(color));
}

function pseudoMoves(state) {
  const { board, turn } = state;
  const enemy = other(turn);
  const moves = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || p.c !== turn) continue;
    const r = sq >> 3, c = sq & 7;
    if (p.t === 'p') {
      const dir = turn === 'w' ? -1 : 1;
      const startRow = turn === 'w' ? 6 : 1;
      const promoRow = turn === 'w' ? 0 : 7;
      const addPawn = (to, extra = {}) => {
        if (to >> 3 === promoRow) {
          for (const promo of ['q', 'r', 'b', 'n']) moves.push({ from: sq, to, promo, ...extra });
        } else {
          moves.push({ from: sq, to, ...extra });
        }
      };
      const one = (r + dir) * 8 + c;
      if (inside(r + dir, c) && !board[one]) {
        addPawn(one);
        const two = (r + 2 * dir) * 8 + c;
        if (r === startRow && !board[two]) moves.push({ from: sq, to: two, double: true });
      }
      for (const dc of [-1, 1]) {
        if (!inside(r + dir, c + dc)) continue;
        const to = (r + dir) * 8 + c + dc;
        if (board[to] && board[to].c === enemy) addPawn(to);
        else if (to === state.ep) moves.push({ from: sq, to, ep: true });
      }
    } else if (p.t === 'n' || p.t === 'k') {
      for (const [dr, dc] of p.t === 'n' ? KNIGHT : KING) {
        if (!inside(r + dr, c + dc)) continue;
        const to = (r + dr) * 8 + c + dc;
        if (!board[to] || board[to].c === enemy) moves.push({ from: sq, to });
      }
      if (p.t === 'k') addCastling(state, sq, moves);
    } else {
      const dirs = p.t === 'r' ? ROOK_DIRS : p.t === 'b' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (inside(rr, cc)) {
          const to = rr * 8 + cc;
          if (board[to]) {
            if (board[to].c === enemy) moves.push({ from: sq, to });
            break;
          }
          moves.push({ from: sq, to });
          rr += dr; cc += dc;
        }
      }
    }
  }
  return moves;
}

function addCastling(state, sq, moves) {
  const { board, turn, castling } = state;
  const home = turn === 'w' ? 60 : 4;
  if (sq !== home) return;
  const enemy = other(turn);
  if (attacked(board, home, enemy)) return;
  const rook = (idx) => isPiece(board[idx], turn, 'r');
  if (castling[turn + 'K'] && !board[home + 1] && !board[home + 2] && rook(home + 3)
    && !attacked(board, home + 1, enemy) && !attacked(board, home + 2, enemy)) {
    moves.push({ from: home, to: home + 2, castle: 'K' });
  }
  if (castling[turn + 'Q'] && !board[home - 1] && !board[home - 2] && !board[home - 3] && rook(home - 4)
    && !attacked(board, home - 1, enemy) && !attacked(board, home - 2, enemy)) {
    moves.push({ from: home, to: home - 2, castle: 'Q' });
  }
}

export function makeMove(state, m) {
  const board = state.board.slice();
  const piece = board[m.from];
  let captured = board[m.to];
  board[m.to] = m.promo ? { c: piece.c, t: m.promo } : piece;
  board[m.from] = null;
  if (m.ep) {
    const capSq = m.to + (piece.c === 'w' ? 8 : -8);
    captured = board[capSq];
    board[capSq] = null;
  }
  if (m.castle === 'K') { board[m.to - 1] = board[m.to + 1]; board[m.to + 1] = null; }
  if (m.castle === 'Q') { board[m.to + 1] = board[m.to - 2]; board[m.to - 2] = null; }

  const castling = { ...state.castling };
  if (piece.t === 'k') { castling[piece.c + 'K'] = false; castling[piece.c + 'Q'] = false; }
  for (const sq of [m.from, m.to]) {
    if (sq === 63) castling.wK = false;
    if (sq === 56) castling.wQ = false;
    if (sq === 7) castling.bK = false;
    if (sq === 0) castling.bQ = false;
  }
  return {
    board,
    turn: other(state.turn),
    castling,
    ep: m.double ? (m.from + m.to) / 2 : null,
    half: piece.t === 'p' || captured ? 0 : state.half + 1,
    full: state.turn === 'b' ? state.full + 1 : state.full,
    captured: captured || null,
  };
}

export function legalMoves(state) {
  return pseudoMoves(state).filter((m) => {
    const next = makeMove(state, m);
    return !attacked(next.board, kingSquare(next.board, state.turn), next.turn);
  });
}

// 千日手判定用の局面キー
export function positionKey(state) {
  let s = '';
  for (const p of state.board) s += p ? (p.c === 'w' ? p.t.toUpperCase() : p.t) : '.';
  const cs = state.castling;
  s += state.turn + (cs.wK ? 'K' : '') + (cs.wQ ? 'Q' : '') + (cs.bK ? 'k' : '') + (cs.bQ ? 'q' : '');
  if (state.ep !== null && legalMoves(state).some((m) => m.ep)) s += state.ep;
  return s;
}

export function insufficientMaterial(board) {
  const minors = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || p.t === 'k') continue;
    if (p.t === 'p' || p.t === 'r' || p.t === 'q') return false;
    minors.push({ t: p.t, color: ((sq >> 3) + (sq & 7)) % 2 });
  }
  if (minors.length <= 1) return true;
  // ビショップだけで全部同じ色のマスなら詰めない
  return minors.every((m) => m.t === 'b') && minors.every((m) => m.color === minors[0].color);
}

// 対局の結果。keys は初期局面からの局面キーの配列 (現在局面を含む)
export function gameStatus(state, keys = []) {
  const moves = legalMoves(state);
  const check = inCheck(state);
  if (moves.length === 0) {
    return check
      ? { over: true, winner: other(state.turn), reason: 'チェックメイト' }
      : { over: true, winner: null, reason: 'ステイルメイト' };
  }
  if (insufficientMaterial(state.board)) return { over: true, winner: null, reason: '駒不足' };
  if (state.half >= 100) return { over: true, winner: null, reason: '50手ルール' };
  const current = keys[keys.length - 1];
  if (current && keys.filter((k) => k === current).length >= 3) {
    return { over: true, winner: null, reason: '同一局面3回' };
  }
  return { over: false, check, moves };
}

export function perft(state, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(state);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(makeMove(state, m), depth - 1);
  return n;
}
