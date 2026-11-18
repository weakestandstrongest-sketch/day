/* Mathspace — 数値フォーマット共通ヘルパー */
window.MS = window.MS || {};
(function (MS) {
  'use strict';

  /** 浮動小数点の誤差を丸める (0.1+0.2 → 0.3) */
  function clean(v) {
    if (typeof v !== 'number' || !isFinite(v)) return v;
    if (v === 0) return 0;
    return parseFloat(v.toPrecision(12));
  }

  function isValid(v) {
    return typeof v === 'number' && isFinite(v);
  }

  /** 正確寄りの表示 (インスペクタ・計算機用) */
  function fmt(v) {
    if (typeof v !== 'number' || isNaN(v)) return 'エラー';
    if (!isFinite(v)) return v > 0 ? '∞' : '-∞';
    v = clean(v);
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e15 || a < 1e-6)) {
      return v.toExponential(6).replace(/\.?0+e/, 'e');
    }
    if (Number.isInteger(v)) return v.toLocaleString('en-US');
    return parseFloat(v.toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 10 });
  }

  /** 短い表示 (ぷに・チップ用)。大きい数は 万/億/兆/京 */
  function short(v) {
    if (!isValid(v)) return fmt(v);
    v = clean(v);
    const a = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (a >= 1e20) return v.toExponential(2).replace(/\.?0+e/, 'e').replace('e+', 'e');
    if (a >= 1e5) {
      const units = [[1e16, '京'], [1e12, '兆'], [1e8, '億'], [1e4, '万']];
      for (const [u, s] of units) {
        if (a >= u) {
          const x = a / u;
          return sign + (x >= 100 ? Math.round(x) : parseFloat(x.toPrecision(3))) + s;
        }
      }
    }
    if (Number.isInteger(v)) return v.toLocaleString('en-US');
    if (a < 1e-3) return v.toExponential(2).replace(/\.?0+e/, 'e');
    return String(parseFloat(v.toPrecision(4)));
  }

  /** 計算式に挿入できる生の文字列 */
  function raw(v) {
    v = clean(v);
    const s = String(v);
    return s.replace('e+', 'e');
  }

  MS.clean = clean;
  MS.isValid = isValid;
  MS.fmt = fmt;
  MS.short = short;
  MS.raw = raw;
})(window.MS);
