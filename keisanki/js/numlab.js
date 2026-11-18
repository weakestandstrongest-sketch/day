/* Mathspace — 数の性質を調べる純粋関数群 */
window.MS = window.MS || {};
(function (MS) {
  'use strict';

  const SAFE = Number.MAX_SAFE_INTEGER;
  const isInt = (v) => Number.isInteger(v) && Math.abs(v) <= SAFE;

  function isPrime(n) {
    if (!isInt(n) || n < 2) return false;
    if (n < 4) return true;
    if (n % 2 === 0 || n % 3 === 0) return false;
    if (n > 1e15) return null; // 重すぎるので判定しない
    for (let i = 5; i * i <= n; i += 6) {
      if (n % i === 0 || n % (i + 2) === 0) return false;
    }
    return true;
  }

  /** 素因数分解 [[p, e], ...]  (n は 2 以上の整数, 1e15 まで) */
  function factorize(n) {
    if (!isInt(n) || n < 2 || n > 1e15) return null;
    const f = [];
    let m = n;
    for (const p of [2, 3]) {
      let c = 0;
      while (m % p === 0) { m /= p; c++; }
      if (c) f.push([p, c]);
    }
    for (let i = 5; i * i <= m; i += 6) {
      for (const p of [i, i + 2]) {
        let c = 0;
        while (m % p === 0) { m /= p; c++; }
        if (c) f.push([p, c]);
      }
    }
    if (m > 1) f.push([m, 1]);
    return f;
  }

  function divisors(n) {
    if (n === 1) return [1];
    const f = factorize(n);
    if (!f) return null;
    let ds = [1];
    for (const [p, e] of f) {
      const next = [];
      for (const d of ds) {
        let x = d;
        for (let k = 0; k <= e; k++) { next.push(x); x *= p; }
      }
      ds = next;
      if (ds.length > 20000) return null;
    }
    return ds.sort((a, b) => a - b);
  }

  function nextPrime(n) {
    if (!isFinite(n) || n > 1e14) return null;
    let k = Math.max(2, Math.floor(n) + 1);
    while (!isPrime(k)) k++;
    return k;
  }
  function prevPrime(n) {
    if (!isFinite(n) || n > 1e14) return null;
    let k = Math.ceil(n) - 1;
    while (k >= 2 && !isPrime(k)) k--;
    return k >= 2 ? k : null;
  }

  function isSquare(n) { if (!isInt(n) || n < 0) return false; const r = Math.round(Math.sqrt(n)); return r * r === n; }
  function isCube(n) { if (!isInt(n)) return false; const r = Math.round(Math.cbrt(n)); return r * r * r === n; }
  function isTriangular(n) { return isInt(n) && n >= 0 && isSquare(8 * n + 1); }
  function isFib(n) {
    if (!isInt(n) || n < 0) return false;
    let a = 0, b = 1;
    while (a < n) { [a, b] = [b, a + b]; }
    return a === n;
  }
  function isPow2(n) { if (!isInt(n) || n < 1) return false; while (n % 2 === 0) n /= 2; return n === 1; }
  function isPalindrome(n) { if (!isInt(n)) return false; const s = String(Math.abs(n)); return s.length > 1 && s === [...s].reverse().join(''); }
  function isPerfect(n) {
    if (!isInt(n) || n < 2 || n > 1e12) return false;
    const ds = divisors(n);
    if (!ds) return false;
    return ds.reduce((a, b) => a + b, 0) - n === n;
  }

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    if (!isInt(a) || !isInt(b)) return NaN;
    while (b) [a, b] = [b, a % b];
    return a;
  }
  function lcm(a, b) {
    if (!isInt(a) || !isInt(b)) return NaN;
    if (a === 0 || b === 0) return 0;
    return Math.abs(a / gcd(a, b) * b);
  }

  function toRoman(n) {
    if (!isInt(n) || n < 1 || n > 3999) return null;
    const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = '';
    for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
    return s;
  }

  function toKanji(n) {
    if (!isInt(n)) return null;
    if (n === 0) return '零';
    const D = '〇一二三四五六七八九';
    const big = ['', '万', '億', '兆', '京'];
    const small = ['', '十', '百', '千'];
    let s = '';
    let x = Math.abs(n);
    let g = 0;
    while (x > 0) {
      const chunk = x % 10000;
      x = Math.floor(x / 10000);
      if (chunk) {
        let c = '';
        const digits = String(chunk).padStart(4, '0');
        for (let i = 0; i < 4; i++) {
          const d = +digits[i];
          const pos = 3 - i;
          if (!d) continue;
          c += (d === 1 && pos > 0 ? '' : D[d]) + small[pos];
        }
        s = c + big[g] + s;
      }
      g++;
    }
    return (n < 0 ? 'マイナス' : '') + s;
  }

  /** 小数 → 分数 (連分数で近似) */
  function toFraction(x, maxDen = 100000) {
    if (!isFinite(x) || Number.isInteger(x)) return null;
    let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
    for (let i = 0; i < 30; i++) {
      const a = Math.floor(b);
      const h2 = a * h1 + h0, k2 = a * k1 + k0;
      if (k2 > maxDen) break;
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      if (Math.abs(x - h1 / k1) < 1e-10) break;
      b = 1 / (b - a);
      if (!isFinite(b)) break;
    }
    if (!k1) return null;
    return { num: h1, den: k1, exact: Math.abs(x - h1 / k1) < 1e-10 };
  }

  /** n = p + q (ゴールドバッハ) */
  function goldbach(n) {
    if (!isInt(n) || n < 4 || n % 2 || n > 1e12) return null;
    for (let p = 2; p <= n / 2; p = nextPrime(p)) {
      if (isPrime(n - p)) return [p, n - p];
    }
    return null;
  }

  /** n = a² + b² */
  function twoSquares(n) {
    if (!isInt(n) || n < 1 || n > 1e12) return null;
    const lim = Math.floor(Math.sqrt(n / 2));
    for (let a = 1; a <= lim; a++) {
      const r = n - a * a;
      if (isSquare(r)) return [a, Math.round(Math.sqrt(r))];
    }
    return null;
  }

  function nthPrime(k) {
    if (!isInt(k) || k < 1 || k > 200000) return null;
    const lim = k < 6 ? 15 : Math.ceil(k * (Math.log(k) + Math.log(Math.log(k))));
    const sieve = new Uint8Array(lim + 1);
    let c = 0;
    for (let i = 2; i <= lim; i++) {
      if (sieve[i]) continue;
      c++;
      if (c === k) return i;
      for (let j = i * i; j <= lim; j += i) sieve[j] = 1;
    }
    return null;
  }

  function fibN(k) {
    if (!isInt(k) || k < 0 || k > 78) return null;
    let a = 0, b = 1;
    for (let i = 0; i < k; i++) [a, b] = [b, a + b];
    return a;
  }

  function collatz(n) {
    if (!isInt(n) || n < 1 || n > 1e12) return null;
    const seq = [n];
    let x = n;
    while (x !== 1 && seq.length < 3000) {
      x = x % 2 === 0 ? x / 2 : 3 * x + 1;
      seq.push(x);
    }
    return seq;
  }

  function digitSum(n) {
    if (!isInt(n)) return null;
    return [...String(Math.abs(n))].reduce((a, d) => a + +d, 0);
  }

  function reverseDigits(n) {
    if (!isInt(n)) return null;
    const r = +[...String(Math.abs(n))].reverse().join('');
    return n < 0 ? -r : r;
  }

  function birthday(k) {
    if (k < 2) return 0;
    if (k > 365) return 1;
    let p = 1;
    for (let i = 0; i < k; i++) p *= (365 - i) / 365;
    return 1 - p;
  }

  /** 数のプロフィール (タグ) */
  function tags(v) {
    const t = [];
    if (!MS.isValid(v)) return t;
    if (isInt(v)) {
      const a = Math.abs(v);
      t.push(String(a).length + '桁');
      if (v !== 0) t.push(v % 2 === 0 ? '偶数' : '奇数');
      const pr = isPrime(v);
      if (pr === true) t.push('素数');
      else if (pr === false && v > 3) t.push('合成数');
      if (v > 1 && isSquare(v)) t.push('平方数');
      if (v > 1 && isCube(v)) t.push('立方数');
      if (v > 2 && isTriangular(v)) t.push('三角数');
      if (v > 3 && isFib(v)) t.push('フィボナッチ数');
      if (v > 2 && isPow2(v)) t.push('2の累乗');
      if (isPerfect(v)) t.push('完全数');
      if (isPalindrome(v)) t.push('回文数');
    } else {
      t.push('小数');
    }
    if (v < 0) t.push('負の数');
    return t;
  }

  /* ---------- 単位変換 (同じ数値を いろいろな単位として読む) ---------- */
  function conversions(v) {
    const g = [];
    g.push({ name: '長さ', base: 'm', items: [
      ['km', v / 1000], ['cm', v * 100], ['mm', v * 1000],
      ['フィート', v / 0.3048], ['インチ', v / 0.0254], ['マイル', v / 1609.344],
      ['東京タワー(333m)', v / 333, '本分'], ['富士山(3,776m)', v / 3776, '個分'],
    ] });
    g.push({ name: '重さ', base: 'kg', items: [
      ['g', v * 1000], ['t', v / 1000], ['ポンド', v / 0.45359237], ['オンス', v / 0.028349523125],
      ['1円玉(1g)', v * 1000, '枚分'],
    ] });
    g.push({ name: '時間', base: '秒', items: [
      ['分', v / 60], ['時間', v / 3600], ['日', v / 86400], ['年', v / 31536000],
    ] });
    g.push({ name: '日数', base: '日', items: [
      ['週', v / 7], ['か月', v / 30.436875], ['年', v / 365.2425], ['時間', v * 24],
    ] });
    g.push({ name: '温度', base: '°C', items: [
      ['°F', v * 9 / 5 + 32], ['K', v + 273.15],
    ] });
    g.push({ name: '温度', base: '°F', items: [
      ['°C', (v - 32) * 5 / 9],
    ] });
    g.push({ name: 'データ', base: 'MB', items: [
      ['KB', v * 1000], ['GB', v / 1000], ['TB', v / 1e6], ['ビット', v * 8e6],
    ] });
    g.push({ name: '速さ', base: 'km/h', items: [
      ['m/秒', v / 3.6], ['ノット', v / 1.852], ['音速(約1,225km/h)', v / 1225, '倍'],
    ] });
    g.push({ name: '面積', base: 'm²', items: [
      ['坪', v / 3.305785], ['畳(約1.62m²)', v / 1.62, '枚'], ['ha', v / 1e4], ['テニスコート', v / 260.76, '面分'],
    ] });
    g.push({ name: '角度', base: '度', items: [
      ['ラジアン', v * Math.PI / 180], ['回転', v / 360],
    ] });
    g.push({ name: '割合', base: '%', items: [
      ['倍', v / 100], ['割', v / 10], ['分(ぶ)', v],
    ] });
    return g;
  }

  /** 表記ゆれ (2進数など) */
  function representations(v) {
    const r = [];
    if (isInt(v)) {
      const sign = v < 0 ? '-' : '';
      const a = Math.abs(v);
      r.push(['2進数', sign + a.toString(2)]);
      r.push(['8進数', sign + a.toString(8)]);
      r.push(['16進数', sign + a.toString(16).toUpperCase()]);
      r.push(['36進数', sign + a.toString(36).toUpperCase()]);
      const kj = toKanji(v); if (kj) r.push(['漢数字', kj]);
      const rm = toRoman(v); if (rm) r.push(['ローマ数字', rm]);
    } else if (MS.isValid(v)) {
      const fr = toFraction(v);
      if (fr) r.push(['分数', (fr.exact ? '' : '≈ ') + fr.num + '/' + fr.den]);
      r.push(['百分率', MS.fmt(v * 100) + '%']);
    }
    if (MS.isValid(v) && v !== 0) {
      r.push(['指数表記', v.toExponential(4).replace(/\.?0+e/, 'e').replace('e', ' × 10^').replace('^+', '^')]);
    }
    return r;
  }

  /* ---------- スケール比較用の「関連データ」 ---------- */
  const LANDMARKS = [
    [0.001, '千分の一'], [0.5, '半分'], [1.414213562, '√2'], [1.618033989, '黄金比'], [2.718281828, 'ネイピア数 e'],
    [3.141592654, '円周率 π'], [7, '1週間の日数'], [12, '1年の月数'], [24, '1日の時間'], [60, '1時間の分数'],
    [100, '百'], [206, '大人の骨の数'], [365, '1年の日数'], [1000, '千'], [3776, '富士山の高さ(m)'],
    [8849, 'エベレストの高さ(m)'], [10000, '万'], [86400, '1日の秒数'], [100000, '1日の心拍数(約)'],
    [1e6, '百万'], [3.1536e7, '1年の秒数'], [4.0075e7, '地球一周(m)'], [1e8, '一億'],
    [1.24e8, '日本の人口(約)'], [2.99792458e8, '光の速さ(m/秒)'], [3.844e8, '地球〜月(m)'],
    [8.1e9, '世界の人口(約)'], [1e12, '一兆'], [1.496e11, '地球〜太陽(m)'], [3.7e13, '人体の細胞数(約)'],
    [1e16, '一京'], [9.46e15, '1光年(m)'], [6.02214076e23, 'アボガドロ数'], [1e100, 'グーゴル'],
  ].sort((a, b) => a[0] - b[0]);

  MS.lab = {
    isInt, isPrime, factorize, divisors, nextPrime, prevPrime, isSquare, isCube, isTriangular, isFib,
    isPow2, isPalindrome, isPerfect, gcd, lcm, toRoman, toKanji, toFraction, goldbach, twoSquares,
    nthPrime, fibN, collatz, digitSum, reverseDigits, birthday, tags, conversions, representations, LANDMARKS,
  };
  MS.isPrime = (v) => isPrime(v) === true;
})(window.MS);
