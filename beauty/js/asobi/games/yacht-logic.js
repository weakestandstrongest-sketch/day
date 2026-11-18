// ヨットの役と得点計算 (UI 非依存)

export const CATEGORIES = [
  { id: 'ones', name: 'エース', face: 1, desc: '1×個数' },
  { id: 'twos', name: 'デュース', face: 2, desc: '2×個数' },
  { id: 'threes', name: 'トレイ', face: 3, desc: '3×個数' },
  { id: 'fours', name: 'フォー', face: 4, desc: '4×個数' },
  { id: 'fives', name: 'ファイブ', face: 5, desc: '5×個数' },
  { id: 'sixes', name: 'シックス', face: 6, desc: '6×個数' },
  { id: 'choice', name: 'チョイス', desc: '全部の合計' },
  { id: 'four', name: 'フォーダイス', desc: '4つ同じ→合計' },
  { id: 'full', name: 'フルハウス', desc: '3つ+2つ→合計' },
  { id: 'sstraight', name: 'S.ストレート', desc: '4連続→15点' },
  { id: 'lstraight', name: 'B.ストレート', desc: '5連続→30点' },
  { id: 'yacht', name: 'ヨット', desc: '5つ同じ→50点' },
];

export const UPPER_IDS = CATEGORIES.filter((c) => c.face).map((c) => c.id);
export const BONUS_THRESHOLD = 63;
export const BONUS = 35;

const sum = (dice) => dice.reduce((a, b) => a + b, 0);

function counts(dice) {
  const n = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) n[d]++;
  return n;
}

function longestRun(dice) {
  const set = new Set(dice);
  let best = 0, cur = 0;
  for (let f = 1; f <= 6; f++) {
    cur = set.has(f) ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

export function score(categoryId, dice) {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  const n = counts(dice);
  if (cat.face) return n[cat.face] * cat.face;
  switch (categoryId) {
    case 'choice': return sum(dice);
    case 'four': return n.some((x) => x >= 4) ? sum(dice) : 0;
    case 'full': {
      const nz = n.filter((x) => x > 0).sort();
      return nz.length === 2 && nz[0] === 2 && nz[1] === 3 ? sum(dice) : 0;
    }
    case 'sstraight': return longestRun(dice) >= 4 ? 15 : 0;
    case 'lstraight': return longestRun(dice) === 5 ? 30 : 0;
    case 'yacht': return n.some((x) => x === 5) ? 50 : 0;
    default: return 0;
  }
}

// sheet は { categoryId: 点数 } (未記入はキーなし)
export function totals(sheet) {
  const upper = UPPER_IDS.reduce((a, id) => a + (sheet[id] ?? 0), 0);
  const bonus = upper >= BONUS_THRESHOLD ? BONUS : 0;
  const lower = CATEGORIES.filter((c) => !c.face).reduce((a, c) => a + (sheet[c.id] ?? 0), 0);
  return { upper, bonus, total: upper + bonus + lower };
}

export const isComplete = (sheet) => CATEGORIES.every((c) => c.id in sheet);
