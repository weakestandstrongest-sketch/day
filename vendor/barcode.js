// 財布のバーコードを描く（JAN/EAN-13・EAN-8・Code128・Code39・NW-7（Codabar）・ITF）。QR は vendor/qrcode.js。
//   HibiBarcode.svg(value, format) → '<svg …>'（読めない値なら null）
//   HibiBarcode.guess(value) → いちばん合いそうな種類
(function () {
  // 太さの並び（バー・スペースの交互、1 = 細い1本ぶん）を、黒い棒の SVG にする
  function svgFromWidths(widths, quiet) {
    let x = quiet, rects = '';
    widths.forEach((w, i) => { if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="60"/>`; x += w; });
    const W = x + quiet;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 60" preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000">${rects}</svg>`;
  }
  // 0/1 の並び（1 = 黒）
  function svgFromBits(bits, quiet) {
    const widths = []; let cur = '1', n = 0;
    for (const b of bits) { if (b === cur) n++; else { widths.push(n); cur = b; n = 1; } }
    widths.push(n);
    return svgFromWidths(widths, quiet);
  }

  // ---- EAN-13 / EAN-8 ----
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const R = L.map((p) => p.split('').map((b) => (b === '1' ? '0' : '1')).join(''));
  const G = R.map((p) => p.split('').reverse().join(''));
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  function eanCheck(d) { let s = 0; for (let i = 0; i < d.length; i++) s += +d[d.length - 1 - i] * (i % 2 === 0 ? 3 : 1); return (10 - (s % 10)) % 10; }
  function ean13(v) {
    if (!/^\d{12,13}$/.test(v)) return null;
    const d = v.slice(0, 12) + eanCheck(v.slice(0, 12));
    if (v.length === 13 && d !== v) return null;
    const par = PARITY[+d[0]];
    let bits = '101';
    for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? L : G)[+d[i]];
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += R[+d[i]];
    bits += '101';
    return svgFromBits(bits, 11);
  }
  function ean8(v) {
    if (!/^\d{7,8}$/.test(v)) return null;
    const d = v.slice(0, 7) + eanCheck(v.slice(0, 7));
    if (v.length === 8 && d !== v) return null;
    let bits = '101';
    for (let i = 0; i < 4; i++) bits += L[+d[i]];
    bits += '01010';
    for (let i = 4; i < 8; i++) bits += R[+d[i]];
    bits += '101';
    return svgFromBits(bits, 7);
  }

  // ---- Code128（B と、数字が続くところは C） ----
  const C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
  function code128(v) {
    if (!v || /[^\x20-\x7e]/.test(v)) return null;
    const codes = [];
    let set = null, i = 0;
    const digitsAt = (k) => { let n = 0; while (k + n < v.length && /\d/.test(v[k + n])) n++; return n; };
    while (i < v.length) {
      const run = digitsAt(i);
      if (run >= 4) {
        const n = run % 2 ? run - 1 : run;
        if (set !== 'C') { codes.push(set === null ? 105 : 99); set = 'C'; }
        for (let k = 0; k < n; k += 2) codes.push(+v.substr(i + k, 2));
        i += n;
        continue;
      }
      if (set !== 'B') { codes.push(set === null ? 104 : 100); set = 'B'; }
      codes.push(v.charCodeAt(i) - 32); i++;
    }
    let sum = codes[0];
    for (let k = 1; k < codes.length; k++) sum += codes[k] * k;
    codes.push(sum % 103, 106);
    const widths = codes.flatMap((c) => C128[c].split('').map(Number));
    return svgFromWidths(widths, 10);
  }

  // ---- Code39 ----
  const C39 = { '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
    A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
    K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
    U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '$': 'nwnwnwnnn',
    '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn' };
  function code39(v) {
    v = String(v).toUpperCase();
    if (!v || [...v].some((c) => !C39[c] || c === '*')) return null;
    const widths = [];
    for (const c of '*' + v + '*') { for (const e of C39[c]) widths.push(e === 'w' ? 3 : 1); widths.push(1); }
    widths.pop();
    return svgFromWidths(widths, 10);
  }

  // ---- NW-7（Codabar）：ポイントカードによくある。前後に A〜D の印（なければ A をつける） ----
  const CB = { '0': '0000011', '1': '0000110', '2': '0001001', '3': '1100000', '4': '0010010', '5': '1000010', '6': '0100001', '7': '0100100', '8': '0110000', '9': '1001000',
    '-': '0001100', '$': '0011000', ':': '1000101', '/': '1010001', '.': '1010100', '+': '0010101', A: '0011010', B: '0101001', C: '0001011', D: '0001110' };
  function codabar(v) {
    v = String(v).toUpperCase();
    if (!/^[A-D]/.test(v)) v = 'A' + v;
    if (!/[A-D]$/.test(v)) v = v + 'A';
    const body = v.slice(1, -1);
    if (!body || /[^0-9\-$:/.+]/.test(body)) return null;
    const widths = [];
    for (const c of v) { for (const e of CB[c]) widths.push(e === '1' ? 3 : 1); widths.push(1); }
    widths.pop();
    return svgFromWidths(widths, 10);
  }

  // ---- ITF（2 of 5 インターリーブ） ----
  const I25 = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'];
  function itf(v) {
    if (!/^\d+$/.test(v)) return null;
    if (v.length % 2) v = '0' + v;
    const widths = [1, 1, 1, 1];
    for (let i = 0; i < v.length; i += 2) {
      const a = I25[+v[i]], b = I25[+v[i + 1]];
      for (let k = 0; k < 5; k++) { widths.push(a[k] === 'w' ? 3 : 1, b[k] === 'w' ? 3 : 1); }
    }
    widths.push(3, 1, 1);
    return svgFromWidths(widths, 10);
  }

  // ---- QR ----
  function qr(v) {
    if (!v || typeof qrcode !== 'function') return null;
    try {
      const q = qrcode(0, 'M'); q.addData(unescape(encodeURIComponent(v)), 'Byte'); q.make();
      const n = q.getModuleCount(); let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><path d="${d}" fill="#000"/></svg>`;
    } catch (e) { return null; }
  }

  const ENC = { ean13, ean8, code128, code39, codabar, itf, qr };
  const NAMES = { ean13: 'JAN（EAN-13）', ean8: 'EAN-8', code128: 'Code128', code39: 'Code39', codabar: 'NW-7（Codabar）', itf: 'ITF', qr: 'QRコード' };
  function guess(v) {
    v = String(v || '').trim();
    if (/^\d{13}$/.test(v) && ean13(v)) return 'ean13';
    if (/^\d{8}$/.test(v) && ean8(v)) return 'ean8';
    if (/^[A-D][0-9\-$:/.+]+[A-D]$/i.test(v)) return 'codabar';
    if (v.length > 40 || /[^\x20-\x7e]/.test(v)) return 'qr';
    return 'code128';
  }
  function svg(v, f) { v = String(v || '').trim(); const e = ENC[f || guess(v)]; return e ? e(v) : null; }
  window.HibiBarcode = { svg, guess, names: NAMES, formats: Object.keys(NAMES), is2D: (f) => f === 'qr' };
})();
