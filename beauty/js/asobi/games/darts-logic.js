// ダーツのルール (DOM に依存しない)
//
// 盤の座標は、ダブルの外周を半径 1 とした正規化座標。x は右、y は下が正 (画面と同じ向き)。

// 真上の 20 から時計回り
export const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

// 公式寸法 (mm) をダブル外周 170mm で割った半径
export const RING = {
  bullIn: 6.35 / 170,
  bullOut: 15.9 / 170,
  tripleIn: 99 / 170,
  tripleOut: 107 / 170,
  doubleIn: 162 / 170,
  doubleOut: 1,
};

export const MODES = {
  countup: { label: 'カウントアップ', start: 0, rounds: 8 },
  301: { label: '301', start: 301, rounds: 15 },
  501: { label: '501', start: 501, rounds: 20 },
};

// (x, y) に刺さったときの得点
export function hitAt(x, y) {
  const r = Math.hypot(x, y);
  if (r > RING.doubleOut) return { n: 0, m: 0, points: 0, label: 'OUT' };
  if (r <= RING.bullIn) return { n: 25, m: 2, points: 50, label: 'BULL' };
  if (r <= RING.bullOut) return { n: 25, m: 1, points: 25, label: '25' };
  const deg = (Math.atan2(x, -y) * 180) / Math.PI; // 真上が 0、時計回り
  const n = ORDER[Math.floor((((deg + 9) % 360) + 360) % 360 / 18)];
  const m = r > RING.doubleIn ? 2 : r > RING.tripleIn && r <= RING.tripleOut ? 3 : 1;
  return { n, m, points: n * m, label: m === 3 ? `T${n}` : m === 2 ? `D${n}` : String(n) };
}

export function newGame(mode = 'countup') {
  const conf = MODES[mode];
  return {
    mode,
    rounds: conf.rounds,
    round: 1,
    turn: 0,
    players: [0, 1].map(() => ({ score: conf.start, turns: [] })),
    darts: [],          // この番に投げた矢 ({ x, y, hit })
    turnStart: conf.start,
    bust: false,
    turnOver: false,
    over: false,
    winner: null,       // 0 / 1 / null (引き分け)
  };
}

const isZeroOne = (state) => state.mode !== 'countup';

// 1本投げる。新しい状態を返す
export function throwDart(state, x, y) {
  if (state.over || state.turnOver) return state;
  const hit = hitAt(x, y);
  const players = state.players.map((p) => ({ ...p }));
  const me = players[state.turn];
  const darts = [...state.darts, { x, y, hit }];
  let { bust, turnOver, over, winner } = state;

  if (isZeroOne(state)) {
    const left = me.score - hit.points;
    if (left < 0) {
      // バースト: この番の得点はなかったことに
      bust = true;
      turnOver = true;
      me.score = state.turnStart;
    } else {
      me.score = left;
      if (left === 0) { over = true; winner = state.turn; turnOver = true; }
    }
  } else {
    me.score += hit.points;
  }
  if (darts.length >= 3) turnOver = true;
  if (turnOver) me.turns = [...me.turns, { darts: darts.map((d) => d.hit), bust }];
  return { ...state, players, darts, bust, turnOver, over, winner };
}

// 次の人へ。2人目が投げ終えたらラウンドが進み、規定ラウンドで終わる
export function nextTurn(state) {
  if (state.over || !state.turnOver) return state;
  const turn = 1 - state.turn;
  const round = turn === 0 ? state.round + 1 : state.round;
  if (round > state.rounds) {
    const [a, b] = state.players.map((p) => p.score);
    const better = isZeroOne(state) ? (a < b ? 0 : b < a ? 1 : null) : (a > b ? 0 : b > a ? 1 : null);
    return { ...state, darts: [], turnOver: true, over: true, winner: better };
  }
  return {
    ...state,
    turn,
    round,
    darts: [],
    turnStart: state.players[turn].score,
    bust: false,
    turnOver: false,
  };
}

// ゼロワンで、残り点数を 3 本以内で上がれる組み合わせ (シングルアウト)。なければ null
export function checkout(left, dartsLeft = 3) {
  if (left <= 0 || left > 180) return null;
  const shots = [];
  for (const n of [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) {
    shots.push({ label: `T${n}`, points: n * 3 }, { label: `D${n}`, points: n * 2 }, { label: String(n), points: n });
  }
  shots.push({ label: 'BULL', points: 50 }, { label: '25', points: 25 });
  shots.sort((a, b) => b.points - a.points);
  const find = (rest, k) => {
    if (rest === 0) return [];
    if (k === 0) return null;
    for (const s of shots) {
      if (s.points > rest) continue;
      const tail = find(rest - s.points, k - 1);
      if (tail) return [s.label, ...tail];
    }
    return null;
  };
  return find(left, dartsLeft);
}
