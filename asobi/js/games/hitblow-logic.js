// ヒットアンドブローの判定 (UI 非依存)

export function judge(secret, guess) {
  let hit = 0;
  const restS = {}, restG = {};
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) hit++;
    else {
      restS[secret[i]] = (restS[secret[i]] || 0) + 1;
      restG[guess[i]] = (restG[guess[i]] || 0) + 1;
    }
  }
  let blow = 0;
  for (const k of Object.keys(restG)) blow += Math.min(restG[k], restS[k] || 0);
  return { hit, blow };
}

export function isValidCode(code, { length, colors, duplicates }) {
  if (code.length !== length) return false;
  if (code.some((x) => !Number.isInteger(x) || x < 0 || x >= colors)) return false;
  return duplicates || new Set(code).size === code.length;
}
