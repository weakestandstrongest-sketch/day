/* Mathspace — グラフ：式を書くと、その場で線が引かれる計算空間
   書けるもの
     y = x^2 / x^2  …… y = f(x)（y= は省いてもよい）
     x = sin(y)     …… x = g(y)
     x^2 + y^2 = 25 …… x と y の関係（陰関数）
     y < x + 1      …… 不等式（範囲をぬる）
     a = 2          …… 数（スライダーになる。ほかの式の a に入る）
     f(x) = x^3 - x …… 関数を作る（ほかの式で f(2) のように使える）
     (1, 2)         …… 点
     2^10           …… x も y もない式は、右に答えを出す */
window.MS = window.MS || {};
(function (MS) {
  'use strict';

  const COLORS = ['#ff5d73', '#5ef1ff', '#b48cff', '#6bff9e', '#ffd36b', '#ff8a3d', '#ff6bd6'];
  const FUNCS = ['arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan', 'sqrt', 'cbrt', 'floor', 'round', 'sign', 'ceil', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'abs', 'log', 'exp', 'min', 'max', 'mod', 'ln'];
  const NAMES = FUNCS.concat(['pi', 'theta']);
  const KEY = 'mathscape-graph';

  /* ---------- 字句 ---------- */
  function tokenize(s) {
    const out = [];
    let i = 0;
    const push = (t, v, a, b) => out.push({ t, v, s: a, e: b });
    while (i < s.length) {
      const c = s[i];
      if (c === ' ') { i++; continue; }
      if (/[0-9.]/.test(c)) {
        let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
        const v = parseFloat(s.slice(i, j));
        if (isNaN(v)) throw err('数の書き方', i);
        push('num', v, i, j); i = j; continue;
      }
      if (/[a-zA-Zα-ωθ]/.test(c) && c !== 'π') {
        let j = i; while (j < s.length && /[a-zA-Zα-ωθ]/.test(s[j]) && s[j] !== 'π') j++;
        const run = s.slice(i, j);
        let k = 0;
        while (k < run.length) {
          const nm = NAMES.find((n) => run.startsWith(n, k));
          if (nm) { push(nm === 'pi' ? 'pi' : nm === 'theta' ? 'var' : 'fn', nm === 'theta' ? 'θ' : nm, i + k, i + k + nm.length); k += nm.length; }
          else { push('var', run[k], i + k, i + k + 1); k++; }
        }
        i = j; continue;
      }
      const two = s.slice(i, i + 2);
      if (two === '<=' || two === '>=') { push('rel', two === '<=' ? '≤' : '≥', i, i + 2); i += 2; continue; }
      const map = { '+': 'op', '-': 'op', '−': 'op', '*': 'op', '·': 'op', '×': 'op', '/': 'op', '÷': 'op', '^': 'op', '(': '(', ')': ')', '[': '(', ']': ')', ',': ',', '|': '|', '!': '!',
        '=': 'rel', '<': 'rel', '>': 'rel', '≤': 'rel', '≥': 'rel', 'π': 'pi', '√': 'sqrt', '∛': 'cbrt' };
      const t = map[c];
      if (!t) throw err(`「${c}」は使えません`, i);
      const v = { '−': '-', '·': '*', '×': '*', '÷': '/', '[': '(', ']': ')' }[c] || c;
      if (t === 'sqrt' || t === 'cbrt') push('fn', t, i, i + 1);
      else push(t, v, i, i + 1);
      i++;
    }
    return out;
  }
  function err(msg, at) { const e = new Error(msg); e.at = at; return e; }

  /* ---------- 構文（AST）---------- */
  function parse(tokens, userFns) {
    let p = 0;
    const peek = () => tokens[p];
    const eat = (t, v) => { const k = tokens[p]; if (k && k.t === t && (v === undefined || k.v === v)) { p++; return k; } return null; };
    const need = (t, v, msg) => { const k = eat(t, v); if (!k) throw err(msg || 'かっこが閉じていません', peek() ? peek().s : -1); return k; };
    const startsPrimary = (k) => k && (k.t === 'num' || k.t === 'var' || k.t === 'pi' || k.t === 'fn' || k.t === '(');

    function expr() { return add(); }
    function add() {
      let a = mul();
      for (;;) {
        const k = peek();
        if (k && k.t === 'op' && (k.v === '+' || k.v === '-')) { p++; a = { k: 'bin', op: k.v, a, b: mul() }; } else return a;
      }
    }
    function mul() {
      let a = unary();
      for (;;) {
        const k = peek();
        if (k && k.t === 'op' && (k.v === '*' || k.v === '/')) { p++; a = { k: 'bin', op: k.v, a, b: unary() }; }
        else if (startsPrimary(k)) a = { k: 'bin', op: '*', a, b: pow() }; // 2x、x(x+1) のようなかけ算の省略
        else return a;
      }
    }
    function unary() {
      const k = peek();
      if (k && k.t === 'op' && (k.v === '-' || k.v === '+')) { p++; const u = unary(); return k.v === '-' ? { k: 'neg', a: u } : u; }
      return pow();
    }
    function pow() {
      let a = post(primary());
      const k = peek();
      if (k && k.t === 'op' && k.v === '^') { p++; a = { k: 'bin', op: '^', a, b: unary() }; }
      return a;
    }
    function post(a) { while (eat('!')) a = { k: 'call', f: 'fact', args: [a] }; return a; }
    function primary() {
      const k = peek();
      if (!k) throw err('式が途中で終わっています', -1);
      if (eat('num')) return { k: 'num', v: k.v };
      if (eat('pi')) return { k: 'num', v: Math.PI };
      if (eat('|')) { const a = expr(); need('|', undefined, '| が閉じていません'); return { k: 'call', f: 'abs', args: [a] }; }
      if (eat('(')) {
        const items = [expr()];
        while (eat(',')) items.push(expr());
        need(')');
        return items.length === 1 ? items[0] : { k: 'tuple', items };
      }
      if (eat('fn')) {
        // sin^2(x) のような書き方
        let powBy = null;
        if (peek() && peek().t === 'op' && peek().v === '^') { p++; powBy = primary(); }
        let args;
        if (eat('(')) { args = [expr()]; while (eat(',')) args.push(expr()); need(')'); }
        else args = [pow()];
        const c = { k: 'call', f: k.v, args };
        return powBy ? { k: 'bin', op: '^', a: c, b: powBy } : c;
      }
      if (eat('var')) {
        // f(x) のように、作った関数を呼ぶ
        if (userFns && userFns.has(k.v) && peek() && peek().t === '(') {
          p++; const args = [expr()]; while (eat(',')) args.push(expr()); need(')');
          return { k: 'ucall', f: k.v, args };
        }
        return { k: 'var', n: k.v };
      }
      throw err(k.t === ')' ? 'かっこの数が合いません' : `「${k.v}」の前に何か足りません`, k.s);
    }
    const tree = expr();
    if (p < tokens.length) throw err(tokens[p].t === ')' ? 'かっこの数が合いません' : '式の書き方', tokens[p].s);
    return tree;
  }

  const freeVars = (n, set = new Set()) => {
    if (!n) return set;
    if (n.k === 'var') set.add(n.n);
    for (const c of [n.a, n.b].concat(n.args || [], n.items || [])) if (c) freeVars(c, set);
    return set;
  };

  /* ---------- JS の関数にする ---------- */
  function fact(n) { if (n < 0 || n !== Math.floor(n)) return gamma(n + 1); let r = 1; for (let i = 2; i <= n && i < 171; i++) r *= i; return n > 170 ? Infinity : r; }
  function gamma(z) { // Lanczos
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    z -= 1; const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61503916999185, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5; return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }
  const LIB = (deg) => {
    const D = deg ? Math.PI / 180 : 1;
    return {
      sin: (a) => Math.sin(a * D), cos: (a) => Math.cos(a * D), tan: (a) => Math.tan(a * D),
      sec: (a) => 1 / Math.cos(a * D), csc: (a) => 1 / Math.sin(a * D), cot: (a) => 1 / Math.tan(a * D),
      asin: (a) => Math.asin(a) / D, acos: (a) => Math.acos(a) / D, atan: (a, b) => (b === undefined ? Math.atan(a) : Math.atan2(a, b)) / D,
      arcsin: (a) => Math.asin(a) / D, arccos: (a) => Math.acos(a) / D, arctan: (a) => Math.atan(a) / D,
      sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
      log: (a, b) => (b === undefined ? Math.log10(a) : Math.log(b) / Math.log(a)), ln: Math.log, exp: Math.exp,
      floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, min: Math.min, max: Math.max,
      mod: (a, b) => ((a % b) + b) % b, fact,
    };
  };
  function compile(n) {
    switch (n.k) {
      case 'num': return `(${n.v})`;
      case 'var': return n.n === 'x' ? 'x' : n.n === 'y' ? 'y' : `P[${JSON.stringify(n.n)}]`;
      case 'neg': return `(-${compile(n.a)})`;
      case 'bin': return n.op === '^' ? `pw(${compile(n.a)},${compile(n.b)})` : `(${compile(n.a)}${n.op}${compile(n.b)})`;
      case 'call': return `L.${n.f}(${n.args.map(compile).join(',')})`;
      case 'ucall': return `F[${JSON.stringify(n.f)}](${n.args.map(compile).join(',')})`;
      case 'tuple': throw err('ここに点は書けません', -1);
      default: throw err('式の書き方', -1);
    }
  }
  // 負の数の分数乗（x^(1/3) など）も、奇数の根なら値を出す
  const pw = (a, b) => {
    if (a < 0 && b !== Math.floor(b)) { const q = 1 / b, r = Math.round(q); if (Math.abs(q - r) < 1e-9 && r % 2) return -Math.pow(-a, b); }
    return Math.pow(a, b);
  };
  function makeFn(n, args, ctx) {
    // eslint-disable-next-line no-new-func
    const f = new Function('L', 'P', 'F', 'pw', ...args, `return ${compile(n)};`);
    return (...a) => f(ctx.L, ctx.P, ctx.F, pw, ...a);
  }

  /* ---------- 1 行を読み解く ---------- */
  function splitRel(tokens) {
    let depth = 0, at = -1, count = 0;
    tokens.forEach((k, i) => {
      if (k.t === '(') depth++; else if (k.t === ')') depth--;
      else if (k.t === 'rel' && depth === 0) { count++; at = i; }
    });
    if (count > 1) throw err('= や < は 1 つまでです', -1);
    return at < 0 ? null : { op: tokens[at].v, l: tokens.slice(0, at), r: tokens.slice(at + 1) };
  }
  // 関数の定義（f(x) = …）・数の定義（a = …）を先に拾う
  function preScan(text) {
    let tokens; try { tokens = tokenize(text); } catch (e) { return null; }
    let rel; try { rel = splitRel(tokens); } catch (e) { return null; }
    if (!rel || rel.op !== '=') return null;
    const L = rel.l;
    if (L.length === 4 && L[0].t === 'var' && !'xye'.includes(L[0].v) && L[1].t === '(' && L[2].t === 'var' && L[3].t === ')') return { kind: 'fdef', name: L[0].v, param: L[2].v, body: rel.r };
    if (L.length === 1 && L[0].t === 'var' && !'xy'.includes(L[0].v)) return { kind: 'pdef', name: L[0].v, body: rel.r };
    return null;
  }

  function analyzeAll(rows, deg) {
    const ctx = { L: LIB(deg), P: {}, F: {} };
    const scans = rows.map((r) => preScan(r.text));
    const userFns = new Set(scans.filter((s) => s && s.kind === 'fdef').map((s) => s.name));
    const params = new Map(); // name → row index
    scans.forEach((s, i) => { if (s && s.kind === 'pdef' && !params.has(s.name)) params.set(s.name, i); });
    const out = rows.map(() => ({}));
    // 関数（ほかの関数や数を使ってよい）
    scans.forEach((s, i) => {
      if (!s || s.kind !== 'fdef') return;
      try {
        const body = parse(s.body, userFns);
        const fn = makeFn(body, [s.param, s.param === 'x' ? 'y' : 'x'], ctx);
        ctx.F[s.name] = fn;
        out[i] = { kind: s.param === 'y' ? 'fy' : 'fx', fn: (v) => fn(v, 0), def: s.name, vars: freeVars(body), param: s.param };
      } catch (e) { out[i] = { error: e.message }; }
    });
    // 数（ほかの数を使ってよい。順番に何度か計算する）
    const pdefs = [...params.entries()];
    const pAst = new Map();
    for (const [name, i] of pdefs) {
      try { pAst.set(name, parse(scans[i].body, userFns)); } catch (e) { out[i] = { error: e.message }; }
    }
    for (let pass = 0; pass < pdefs.length + 1; pass++) {
      for (const [name] of pdefs) {
        const a = pAst.get(name); if (!a) continue;
        const fv = freeVars(a);
        if (fv.has('x') || fv.has('y')) continue;
        try { const v = makeFn(a, [], ctx)(); if (isFinite(v)) ctx.P[name] = v; } catch (e) { /* 後で */ }
      }
    }
    if (!('e' in ctx.P)) ctx.P.e = Math.E;
    for (const [name, i] of pdefs) {
      if (out[i].error) continue;
      const a = pAst.get(name); if (!a) continue;
      const fv = freeVars(a);
      if (fv.has('x') || fv.has('y')) { out[i] = { error: `${name} = の右に x や y は使えません` }; continue; }
      const literal = scans[i].body.length === 1 && scans[i].body[0].t === 'num' || (scans[i].body.length === 2 && scans[i].body[0].v === '-' && scans[i].body[1].t === 'num');
      out[i] = { kind: 'param', name, value: ctx.P[name], slider: literal };
      if (params.get(name) !== i) out[i] = { error: `${name} は前の行で決めています` };
    }
    // そのほかの行
    rows.forEach((r, i) => {
      if (scans[i] || !r.text.trim()) { if (!r.text.trim()) out[i] = { empty: true }; return; }
      try { out[i] = classify(tokenize(r.text), userFns, ctx); } catch (e) { out[i] = { error: e.message }; }
    });
    // 決めていない文字 → スライダーを作れる
    out.forEach((o, i) => {
      if (!o.vars || o.error) return;
      const missing = [...o.vars].filter((v) => v !== 'x' && v !== 'y' && v !== (o.param || '') && !(v in ctx.P) && !userFns.has(v));
      if (missing.length) out[i] = { error: `${missing.join('・')} が決まっていません`, missing };
    });
    return { out, ctx };
  }

  function classify(tokens, userFns, ctx) {
    const rel = splitRel(tokens);
    if (!rel) {
      const a = parse(tokens, userFns);
      if (a.k === 'tuple') {
        if (a.items.length !== 2) throw err('点は (x, y) の形で書きます', -1);
        const fx = makeFn(a.items[0], [], ctx)(), fy = makeFn(a.items[1], [], ctx)();
        return { kind: 'point', x: fx, y: fy, vars: freeVars(a) };
      }
      const vars = freeVars(a);
      if (vars.has('y') && !vars.has('x')) return { kind: 'fy', fn: makeFn(a, ['y'], ctx), vars, implicitY: true };
      if (vars.has('x') && vars.has('y')) return { kind: 'implicit', op: '=', fn: makeFn(a, ['x', 'y'], ctx), vars };
      if (!vars.has('x')) return { kind: 'value', value: makeFn(a, [], ctx)(), vars };
      return { kind: 'fx', fn: makeFn(a, ['x'], ctx), vars };
    }
    const L = parse(rel.l, userFns), R = parse(rel.r, userFns);
    const lv = freeVars(L), rv = freeVars(R);
    const isY = (n) => n.k === 'var' && n.n === 'y', isX = (n) => n.k === 'var' && n.n === 'x';
    const vars = new Set([...lv, ...rv]);
    let op = rel.op;
    const flip = { '<': '>', '>': '<', '≤': '≥', '≥': '≤', '=': '=' };
    if (isY(L) && !rv.has('y')) return { kind: op === '=' ? 'fx' : 'yineq', op, fn: makeFn(R, ['x'], ctx), vars };
    if (isY(R) && !lv.has('y')) return { kind: op === '=' ? 'fx' : 'yineq', op: flip[op], fn: makeFn(L, ['x'], ctx), vars };
    if (isX(L) && !rv.has('x')) return { kind: op === '=' ? 'fy' : 'xineq', op, fn: makeFn(R, ['y'], ctx), vars };
    if (isX(R) && !lv.has('x')) return { kind: op === '=' ? 'fy' : 'xineq', op: flip[op], fn: makeFn(L, ['y'], ctx), vars };
    if (!vars.has('x') && !vars.has('y')) {
      const a = makeFn(L, [], ctx)(), b = makeFn(R, [], ctx)();
      if (op === '=') return { kind: 'value', value: a, check: Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a)), vars };
      return { kind: 'value', value: a, check: { '<': a < b, '>': a > b, '≤': a <= b, '≥': a >= b }[op], vars };
    }
    const lf = makeFn(L, ['x', 'y'], ctx), rf = makeFn(R, ['x', 'y'], ctx);
    return { kind: 'implicit', op, fn: (x, y) => lf(x, y) - rf(x, y), vars };
  }

  /* ---------- 数の見せ方 ---------- */
  function fmt(v, digits = 6) {
    if (v === undefined || v === null || isNaN(v)) return '—';
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    if (Math.abs(v) < 1e-12) return '0';
    const a = Math.abs(v);
    let s;
    if (a >= 1e9 || a < 1e-5) s = v.toExponential(4).replace(/\.?0+e/, 'e').replace('e+', '×10^').replace('e-', '×10^-');
    else s = String(+v.toFixed(Math.max(0, digits - Math.max(0, Math.floor(Math.log10(a)) + 1)) + 0));
    return s.replace('-', '−');
  }

  /* ---------- 式をきれいに見せる（文字ごとに区切って、カーソルの位置も出す）---------- */
  function pretty(text, caret) {
    const n = text.length;
    const cls = new Array(n).fill('');
    const shown = text.split('');
    // 関数名
    let i = 0;
    while (i < n) {
      if (/[a-zA-Z]/.test(text[i])) {
        let j = i; while (j < n && /[a-zA-Z]/.test(text[j])) j++;
        const run = text.slice(i, j);
        let k = 0;
        while (k < run.length) {
          const nm = NAMES.find((m) => run.startsWith(m, k));
          if (nm) { for (let q = 0; q < nm.length; q++) cls[i + k + q] = 'gf'; if (nm === 'pi') { shown[i + k] = 'π'; shown[i + k + 1] = ''; } k += nm.length; }
          else { cls[i + k] = 'gv'; k++; }
        }
        i = j;
      } else i++;
    }
    const level = new Array(n).fill(0);
    for (let p = 0; p < n; p++) {
      const c = text[p];
      if (/[0-9.]/.test(c)) cls[p] = 'gn';
      else if ('+-−*·×/÷=<>≤≥'.includes(c)) { cls[p] = 'go'; shown[p] = { '-': '−', '*': '·', '/': '÷', '<': '<', '>': '>' }[c] || c; }
      else if (c === 'π') cls[p] = 'gv';
      if (c === '^') {
        shown[p] = ''; cls[p] = 'gcaret';
        let a = p + 1, b = a;
        if (text[a] === '(') { let d = 0; for (b = a; b < n; b++) { if (text[b] === '(') d++; else if (text[b] === ')' && --d === 0) { b++; break; } } }
        else if (/[0-9.]/.test(text[a] || '')) { while (b < n && /[0-9.]/.test(text[b])) b++; }
        else if (/[a-zA-Zπθ]/.test(text[a] || '')) { b = a + 1; while (b < n && cls[b] === 'gf' && cls[a] === 'gf') b++; }
        else if (text[a] === '-' || text[a] === '−') { b = a + 1; while (b < n && /[0-9.a-z]/.test(text[b])) b++; }
        for (let q = a; q < Math.min(b, n); q++) level[q]++;
      }
    }
    let html = '', cur = 0;
    const CARET = '<i class="gk-caret"></i>';
    for (let p = 0; p <= n; p++) {
      const want = p < n ? level[p] : 0;
      if (caret === p && want <= cur) html += CARET;
      while (cur < want) { html += '<sup>'; cur++; }
      while (cur > want) { html += '</sup>'; cur--; }
      if (caret === p && want > 0 && html.slice(-CARET.length) !== CARET) html += CARET;
      if (p === n) break;
      const ch = shown[p].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html += `<span class="${cls[p]}" data-i="${p}">${ch || '​'}</span>`;
    }
    while (cur-- > 0) html += '</sup>';
    return html;
  }

  /* ---------- グラフの画面 ---------- */
  class Graph {
    constructor(root, opts) {
      this.root = root;
      this.opts = opts || {};
      this.cv = root.querySelector('#grCanvas');
      this.g = this.cv.getContext('2d');
      this.list = root.querySelector('#grList');
      this.keys = root.querySelector('#grKeys');
      this.state = this.load();
      this.active = Math.min(this.state.rows.length - 1, 0);
      this.caret = this.state.rows[this.active] ? this.state.rows[this.active].text.length : 0;
      this.undo = []; this.redo = [];
      this.labels = new Set(); // 名前を出している点
      this.trace = null;
      this.kbMode = 'main';
      this.kbOpen = true;
      this.bind();
      this.buildKeys();
    }

    load() {
      let s = null;
      try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
      if (!s || !Array.isArray(s.rows)) s = { rows: [{ text: 'y=x^2', color: COLORS[0] }, { text: '', color: COLORS[1] }], view: null, deg: false, grid: true };
      s.rows.forEach((r, i) => { r.color = r.color || COLORS[i % COLORS.length]; r.id = r.id || Math.random().toString(36).slice(2); });
      return s;
    }
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* いっぱい */ } }
    snapshot() { this.undo.push(JSON.stringify(this.state.rows)); if (this.undo.length > 100) this.undo.shift(); this.redo = []; }

    show() {
      this.root.hidden = false;
      this.resize();
      if (!this.state.view) this.home(false);
      this.analyze();
      this.renderList();
      this.renderKeys();
      this.draw();
      this._onResize = () => { this.resize(); this.draw(); };
      addEventListener('resize', this._onResize);
    }
    close() {
      this.root.hidden = true;
      removeEventListener('resize', this._onResize);
      this.save();
      if (this.opts.onClose) this.opts.onClose();
    }

    resize() {
      const r = this.cv.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
      this.W = Math.max(1, r.width); this.H = Math.max(1, r.height); this.dpr = dpr;
      this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
    }
    home(redraw = true) {
      const s = Math.min(this.W || 360, this.H || 300) / 16;
      this.state.view = { cx: 0, cy: 0, s };
      if (redraw) { this.draw(); this.save(); }
    }
    zoomBy(k, px, py) {
      const v = this.state.view;
      px = px === undefined ? this.W / 2 : px; py = py === undefined ? this.H / 2 : py;
      const wx = this.toX(px), wy = this.toY(py);
      v.s = Math.min(1e7, Math.max(1e-5, v.s * k));
      v.cx = wx - (px - this.W / 2) / v.s;
      v.cy = wy + (py - this.H / 2) / v.s;
      this.draw();
    }
    toX(px) { const v = this.state.view; return v.cx + (px - this.W / 2) / v.s; }
    toY(py) { const v = this.state.view; return v.cy - (py - this.H / 2) / v.s; }
    sx(x) { const v = this.state.view; return this.W / 2 + (x - v.cx) * v.s; }
    sy(y) { const v = this.state.view; return this.H / 2 - (y - v.cy) * v.s; }

    analyze() {
      const { out, ctx } = analyzeAll(this.state.rows, this.state.deg);
      this.info = out; this.ctx = ctx;
    }

    /* ---- 入力 ---- */
    get row() { return this.state.rows[this.active]; }
    insert(s, back = 0) {
      if (!this.row) this.addRow();
      this.snapshot();
      const t = this.row.text;
      this.row.text = t.slice(0, this.caret) + s + t.slice(this.caret);
      this.caret += s.length - back;
      this.changed();
    }
    backspace() {
      if (!this.row) return;
      const t = this.row.text;
      if (this.caret === 0) {
        if (!t && this.state.rows.length > 1) { this.removeRow(this.active, true); }
        return;
      }
      this.snapshot();
      // 関数名はまとめて消す
      const before = t.slice(0, this.caret);
      const m = before.match(new RegExp(`(${FUNCS.join('|')})\\($`));
      const n = m ? m[0].length : 1;
      // 「()」の間でなら、右のかっこも消す
      const pair = t[this.caret - 1] === '(' && t[this.caret] === ')' ? 1 : 0;
      this.row.text = t.slice(0, this.caret - n) + t.slice(this.caret + pair);
      this.caret -= n;
      this.changed();
    }
    move(d) {
      if (!this.row) return;
      this.caret = Math.max(0, Math.min(this.row.text.length, this.caret + d));
      this.renderList(false);
    }
    enter() {
      // 次の行へ（なければ作る）
      if (this.active === this.state.rows.length - 1) { if (!this.row.text.trim()) return; this.addRow(); }
      else { this.active++; this.caret = this.row.text.length; this.renderList(); this.draw(); }
    }
    addRow(text = '') {
      const used = this.state.rows.map((r) => r.color);
      const color = COLORS.find((c) => !used.includes(c)) || COLORS[this.state.rows.length % COLORS.length];
      this.state.rows.splice(this.active + 1, 0, { id: Math.random().toString(36).slice(2), text, color });
      this.active++;
      this.caret = text.length;
      this.changed();
    }
    removeRow(i, toPrev) {
      this.snapshot();
      this.state.rows.splice(i, 1);
      if (!this.state.rows.length) this.state.rows.push({ id: 'r0', text: '', color: COLORS[0] });
      this.active = Math.max(0, Math.min(this.state.rows.length - 1, toPrev ? i - 1 : i));
      this.caret = this.row.text.length;
      this.changed();
    }
    changed() {
      this.trace = null;
      this.analyze();
      this.renderList();
      this.draw();
      this.save();
    }
    doUndo() { const s = this.undo.pop(); if (!s) return; this.redo.push(JSON.stringify(this.state.rows)); this.state.rows = JSON.parse(s); this.active = Math.min(this.active, this.state.rows.length - 1); this.caret = this.row.text.length; this.changed(); }
    doRedo() { const s = this.redo.pop(); if (!s) return; this.undo.push(JSON.stringify(this.state.rows)); this.state.rows = JSON.parse(s); this.active = Math.min(this.active, this.state.rows.length - 1); this.caret = this.row.text.length; this.changed(); }

    /* ---- 式の一覧 ---- */
    renderList(full = true) {
      const rows = this.state.rows;
      if (!full && this.list.children.length === rows.length) {
        const el = this.list.children[this.active];
        if (el) el.querySelector('.gr-tx').innerHTML = pretty(this.row.text, this.caret);
        return;
      }
      this.list.replaceChildren(...rows.map((r, i) => {
        const o = (this.info && this.info[i]) || {};
        const el = document.createElement('div');
        el.className = `gr-row${i === this.active ? ' on' : ''}${r.hidden ? ' off' : ''}`;
        el.style.setProperty('--c', r.color);
        const drawable = ['fx', 'fy', 'implicit', 'yineq', 'xineq', 'point'].includes(o.kind);
        let right = '';
        if (o.kind === 'value') right = `<span class="gr-val${o.check === false ? ' no' : ''}">${o.check === undefined ? '= ' + fmt(o.value, 10) : o.check ? '正しい' : 'まちがい'}</span>`;
        if (o.kind === 'point') right = `<span class="gr-val small">(${fmt(o.x, 4)}, ${fmt(o.y, 4)})</span>`;
        if (o.error && r.text.trim()) right = `<span class="gr-err" title="${o.error}">${o.error}</span>`;
        let below = '';
        if (o.kind === 'param' && o.slider) {
          const v = o.value, lo = r.min !== undefined ? r.min : Math.min(-10, Math.floor(v)), hi = r.max !== undefined ? r.max : Math.max(10, Math.ceil(v));
          below = `<div class="gr-slider"><small>${fmt(lo)}</small><input type="range" min="${lo}" max="${hi}" step="${(hi - lo) / 200}" value="${v}" data-i="${i}"><small>${fmt(hi)}</small><button type="button" class="gr-play${r.play ? ' on' : ''}" data-play="${i}" aria-label="動かす">${r.play ? '❚❚' : '▶'}</button></div>`;
        }
        if (o.missing) below = `<div class="gr-miss">${o.missing.map((m) => `<button type="button" data-add="${m}">スライダーを作る：${m}</button>`).join('')}</div>`;
        el.innerHTML = `<button type="button" class="gr-dot" data-dot="${i}" aria-label="表示を切り替え">${drawable ? `<i class="k-${o.kind}"></i>` : `<b>${i + 1}</b>`}</button>`
          + `<div class="gr-main"><div class="gr-tx" data-row="${i}">${pretty(r.text, i === this.active ? this.caret : -1)}</div>${right}${below}</div>`
          + `<button type="button" class="gr-del" data-del="${i}" aria-label="消す">✕</button>`;
        return el;
      }));
      const on = this.list.children[this.active];
      if (on && full) on.scrollIntoView({ block: 'nearest' });
      this.root.querySelector('#grUndo').disabled = !this.undo.length;
      this.root.querySelector('#grRedo').disabled = !this.redo.length;
    }

    /* ---- キーボード ---- */
    buildKeys() {
      this.KB = {
        main: [
          ['x', 'x'], ['y', 'y'], ['a²', '^2'], ['aᵇ', '^'], ['7'], ['8'], ['9'], ['÷', '/'], ['関数', '#fn', 'wide2'],
          ['(', '()', '', 1], [')'], ['<'], ['>'], ['4'], ['5'], ['6'], ['×', '*'], ['←', '#l'], ['→', '#r'],
          ['|a|', '||', '', 1], [','], ['≤'], ['≥'], ['1'], ['2'], ['3'], ['−', '-'], ['⌫', '#bs', 'wide2'],
          ['ABC', '#abc'], ['√', '√()', '', 1], ['π'], ['e'], ['0'], ['.'], ['='], ['+'], ['↵', '#enter', 'wide2 go'],
        ],
        fn: [
          ['sin', 'sin()', '', 1], ['cos', 'cos()', '', 1], ['tan', 'tan()', '', 1], ['ln', 'ln()', '', 1], ['log', 'log()', '', 1], ['eˣ', 'exp()', '', 1],
          ['sin⁻¹', 'arcsin()', '', 1], ['cos⁻¹', 'arccos()', '', 1], ['tan⁻¹', 'arctan()', '', 1], ['√', 'sqrt()', '', 1], ['∛', 'cbrt()', '', 1], ['|a|', 'abs()', '', 1],
          ['sinh', 'sinh()', '', 1], ['cosh', 'cosh()', '', 1], ['tanh', 'tanh()', '', 1], ['⌊a⌋', 'floor()', '', 1], ['⌈a⌉', 'ceil()', '', 1], ['n!', '!'],
          ['min', 'min()', '', 1], ['max', 'max()', '', 1], ['mod', 'mod()', '', 1], ['round', 'round()', '', 1], ['θ'], ['戻る', '#main', 'go'],
        ],
        abc: 'qwertyuiopasdfghjklzxcvbnm'.split('').map((c) => [c]).concat([['⌫', '#bs'], ['123', '#main', 'go']]),
      };
    }
    renderKeys() {
      const set = this.KB[this.kbMode];
      this.keys.className = `gr-keys k-${this.kbMode}${this.kbOpen ? '' : ' closed'}`;
      this.keys.replaceChildren(...set.map(([label, val, cls, back]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `gk ${cls || ''} ${/^[0-9.]$/.test(label) ? 'num' : ''}`;
        b.textContent = label;
        b.dataset.v = val === undefined ? label : val;
        if (back) b.dataset.back = back;
        return b;
      }));
    }
    key(v, back) {
      if (v === '#fn') { this.kbMode = 'fn'; this.renderKeys(); return; }
      if (v === '#abc') { this.kbMode = 'abc'; this.renderKeys(); return; }
      if (v === '#main') { this.kbMode = 'main'; this.renderKeys(); return; }
      if (v === '#bs') return this.backspace();
      if (v === '#l') return this.move(-1);
      if (v === '#r') return this.move(1);
      if (v === '#enter') return this.enter();
      // 右のかっこは、すぐ右に ) があればそこを越えるだけ
      if (v === ')' && this.row && this.row.text[this.caret] === ')') { this.move(1); return; }
      this.insert(v, +back || 0);
      if (this.kbMode === 'fn') { this.kbMode = 'main'; this.renderKeys(); }
    }

    bind() {
      const R = this.root;
      R.querySelector('#grClose').addEventListener('click', () => this.close());
      R.querySelector('#grAdd').addEventListener('click', () => { this.active = this.state.rows.length - 1; if (this.row.text.trim()) this.addRow(); else { this.caret = 0; this.renderList(); } this.openKeys(true); });
      R.querySelector('#grUndo').addEventListener('click', () => this.doUndo());
      R.querySelector('#grRedo').addEventListener('click', () => this.doRedo());
      R.querySelector('#grHome').addEventListener('click', () => this.home());
      R.querySelector('#grZin').addEventListener('click', () => this.zoomBy(1.5));
      R.querySelector('#grZout').addEventListener('click', () => this.zoomBy(1 / 1.5));
      R.querySelector('#grFold').addEventListener('click', () => this.openKeys(!this.kbOpen));
      R.querySelector('#grSet').addEventListener('click', () => {
        const m = R.querySelector('#grMenu'); m.hidden = !m.hidden;
        m.querySelector('[data-set=deg]').textContent = this.state.deg ? '角度：度（°）' : '角度：ラジアン';
        m.querySelector('[data-set=grid]').textContent = this.state.grid ? '方眼：あり' : '方眼：なし';
      });
      R.querySelector('#grMenu').addEventListener('click', (e) => {
        const b = e.target.closest('[data-set]'); if (!b) return;
        const k = b.dataset.set;
        if (k === 'deg') { this.state.deg = !this.state.deg; b.textContent = this.state.deg ? '角度：度（°）' : '角度：ラジアン'; this.changed(); }
        if (k === 'grid') { this.state.grid = !this.state.grid; b.textContent = this.state.grid ? '方眼：あり' : '方眼：なし'; this.draw(); this.save(); }
        if (k === 'clear') { this.snapshot(); this.state.rows = [{ id: 'r0', text: '', color: COLORS[0] }]; this.active = 0; this.caret = 0; this.labels.clear(); this.changed(); R.querySelector('#grMenu').hidden = true; }
        if (k.startsWith('ex:')) {
          this.snapshot();
          this.state.rows = EXAMPLES[+k.slice(3)].rows.map((t, i) => ({ id: 'r' + i + Date.now(), text: t, color: COLORS[i % COLORS.length] }));
          this.active = 0; this.caret = this.row.text.length; this.labels.clear(); this.home(false); this.changed(); R.querySelector('#grMenu').hidden = true;
        }
      });
      // キーは押した瞬間に（入力欄から目を離さずに速く打てるように）
      this.keys.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('.gk'); if (!b) return;
        e.preventDefault();
        b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 120);
        this.key(b.dataset.v, b.dataset.back);
        if (navigator.vibrate) try { navigator.vibrate(5); } catch (x) { /* なし */ }
      });
      this.list.addEventListener('click', (e) => {
        const del = e.target.closest('[data-del]');
        if (del) { this.removeRow(+del.dataset.del); return; }
        const dot = e.target.closest('[data-dot]');
        if (dot) { const r = this.state.rows[+dot.dataset.dot]; r.hidden = !r.hidden; this.save(); this.renderList(); this.draw(); return; }
        const add = e.target.closest('[data-add]');
        if (add) { const at = this.active; this.active = this.state.rows.length - 1; this.addRow(`${add.dataset.add}=1`); this.active = Math.min(at, this.state.rows.length - 1); this.caret = this.row.text.length; this.renderList(); return; }
        const play = e.target.closest('[data-play]');
        if (play) { const r = this.state.rows[+play.dataset.play]; r.play = !r.play; this.renderList(); this.animate(); return; }
        const tx = e.target.closest('[data-row]');
        const rowEl = e.target.closest('.gr-row');
        if (!rowEl || e.target.closest('.gr-slider')) return;
        const i = [...this.list.children].indexOf(rowEl);
        this.active = i;
        const ch = e.target.closest('[data-i]');
        if (ch) { const r = ch.getBoundingClientRect(); this.caret = +ch.dataset.i + (e.clientX > r.left + r.width / 2 ? 1 : 0); }
        else if (tx || true) this.caret = this.row.text.length;
        this.renderList(); this.draw(); this.openKeys(true);
      });
      this.list.addEventListener('input', (e) => {
        const s = e.target.closest('input[type=range]'); if (!s) return;
        const i = +s.dataset.i, r = this.state.rows[i];
        const pre = preScan(r.text); if (!pre) return;
        const step = +s.step, v = Math.round(+s.value / step) * step;
        r.text = `${pre.name}=${+v.toFixed(4)}`;
        this.analyze();
        const tx = this.list.children[i] && this.list.children[i].querySelector('.gr-tx');
        if (tx) tx.innerHTML = pretty(r.text, i === this.active ? (this.caret = r.text.length) : -1);
        this.refreshValues();
        this.draw();
      });
      this.list.addEventListener('change', () => this.save());
      // 画面の外のキーボード（パソコン）
      addEventListener('keydown', (e) => {
        if (this.root.hidden || e.metaKey || e.ctrlKey) return;
        if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
        if (e.key === 'Backspace') { e.preventDefault(); this.backspace(); }
        else if (e.key === 'ArrowLeft') this.move(-1);
        else if (e.key === 'ArrowRight') this.move(1);
        else if (e.key === 'ArrowUp') { if (this.active > 0) { this.active--; this.caret = this.row.text.length; this.renderList(); this.draw(); } }
        else if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); this.enter(); }
        else if (e.key === 'Escape') this.close();
        else if (e.key.length === 1) { e.preventDefault(); this.insert(e.key === '(' ? '()' : e.key, e.key === '(' ? 1 : 0); }
      });
      this.bindCanvas();
    }
    openKeys(on) {
      this.kbOpen = on;
      this.root.classList.toggle('kb-off', !on);
      this.root.querySelector('#grFold').textContent = on ? '⌄' : '⌨';
      this.renderKeys();
      requestAnimationFrame(() => { this.resize(); this.draw(); });
    }
    refreshValues() {
      // スライダーを動かしている間は、一覧の答え（= の右）だけを書き直す
      this.info.forEach((o, i) => {
        const el = this.list.children[i]; if (!el) return;
        const v = el.querySelector('.gr-val');
        if (v && o.kind === 'value') v.textContent = o.check === undefined ? '= ' + fmt(o.value, 10) : o.check ? '正しい' : 'まちがい';
        if (v && o.kind === 'point') v.textContent = `(${fmt(o.x, 4)}, ${fmt(o.y, 4)})`;
      });
    }
    animate() {
      if (this._anim) return;
      const step = () => {
        const playing = this.state.rows.map((r, i) => [r, i]).filter(([r]) => r.play);
        if (!playing.length || this.root.hidden) { this._anim = 0; return; }
        for (const [r, i] of playing) {
          const o = this.info[i]; if (!o || o.kind !== 'param') continue;
          const lo = r.min !== undefined ? r.min : Math.min(-10, Math.floor(o.value)), hi = r.max !== undefined ? r.max : Math.max(10, Math.ceil(o.value));
          let v = o.value + (hi - lo) / 240 * (r.dir || 1);
          if (v > hi) { v = hi; r.dir = -1; } if (v < lo) { v = lo; r.dir = 1; }
          r.text = `${o.name}=${+v.toFixed(3)}`;
          const s = this.list.children[i] && this.list.children[i].querySelector('input[type=range]'); if (s) s.value = v;
          const tx = this.list.children[i] && this.list.children[i].querySelector('.gr-tx'); if (tx) tx.innerHTML = pretty(r.text, i === this.active ? (this.caret = r.text.length) : -1);
        }
        this.analyze(); this.refreshValues(); this.draw();
        this._anim = requestAnimationFrame(step);
      };
      this._anim = requestAnimationFrame(step);
    }

    /* ---- さわる：動かす・拡大・なぞる ---- */
    bindCanvas() {
      const cv = this.cv, pts = new Map();
      let pinch = null, last = null, moved = false, downAt = 0;
      cv.addEventListener('pointerdown', (e) => {
        cv.setPointerCapture(e.pointerId);
        const p = this.local(e);
        pts.set(e.pointerId, p);
        moved = false; downAt = Date.now();
        this.root.querySelector('#grMenu').hidden = true;
        if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.state.view.s, m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; this.trace = null; return; }
        // 灰色の点の上なら、なぞらずに（離したときに座標を出す）
        if ((this.marks || []).some((m) => Math.hypot(this.sx(m.x) - p.x, this.sy(m.y) - p.y) < 16)) { this.trace = null; return; }
        // 線の近くなら、なぞる
        const hit = this.hitCurve(p.x, p.y);
        if (hit) { this.trace = hit; this.draw(); return; }
        last = p;
      });
      cv.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        const p = this.local(e);
        pts.set(e.pointerId, p);
        if (pinch && pts.size === 2) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const v = this.state.view;
          // つまんだ真ん中の点を、指の下に保ったまま拡大
          const wx = this.toX(pinch.m.x), wy = this.toY(pinch.m.y);
          v.s = Math.min(1e7, Math.max(1e-5, pinch.s * d / pinch.d));
          v.cx = wx - (m.x - this.W / 2) / v.s; v.cy = wy + (m.y - this.H / 2) / v.s;
          pinch.m = m; pinch.s = v.s; pinch.d = d;
          moved = true; this.draw(); return;
        }
        if (this.trace) { this.trace = this.traceAt(this.trace.i, p.x, p.y) || this.trace; this.draw(); return; }
        if (last) {
          const v = this.state.view, dx = p.x - last.x, dy = p.y - last.y;
          if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
          v.cx -= dx / v.s; v.cy += dy / v.s; last = p; this.draw();
        }
      });
      const up = (e) => {
        const p = pts.get(e.pointerId);
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
        if (!pts.size) {
          if (!moved && !this.trace && p && Date.now() - downAt < 400) this.tapPoint(p.x, p.y);
          if (this.trace && this.trace.keep !== true) { /* 指を離しても点は残す */ }
          last = null; this.save();
        }
      };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = this.local(e); this.zoomBy(Math.exp(-e.deltaY * 0.0015), p.x, p.y); this.save(); }, { passive: false });
      cv.addEventListener('dblclick', (e) => { const p = this.local(e); this.zoomBy(2, p.x, p.y); });
    }
    local(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    visible(i) { const r = this.state.rows[i], o = this.info[i]; return r && !r.hidden && o && !o.error; }
    hitCurve(px, py) {
      let best = null;
      this.info.forEach((o, i) => {
        if (!this.visible(i) || (o.kind !== 'fx' && o.kind !== 'fy')) return;
        const t = this.traceAt(i, px, py);
        if (t && t.d < 26 && (!best || t.d < best.d)) best = t;
      });
      return best;
    }
    traceAt(i, px, py) {
      const o = this.info[i]; if (!o) return null;
      try {
        if (o.kind === 'fx') { const x = this.toX(px), y = o.fn(x); if (!isFinite(y)) return null; return { i, x, y, d: Math.abs(this.sy(y) - py) }; }
        if (o.kind === 'fy') { const y = this.toY(py), x = o.fn(y); if (!isFinite(x)) return null; return { i, x, y, d: Math.abs(this.sx(x) - px) }; }
      } catch (e) { return null; }
      return null;
    }
    tapPoint(px, py) {
      // 灰色の点（交わる点・山・谷・0 になる所）を押すと、座標を出す／しまう
      const hit = (this.marks || []).find((m) => Math.hypot(this.sx(m.x) - px, this.sy(m.y) - py) < 18);
      if (hit) { const k = hit.x.toFixed(9) + ',' + hit.y.toFixed(9); if (this.labels.has(k)) this.labels.delete(k); else this.labels.add(k); }
      else this.trace = null;
      this.draw();
    }

    /* ---- 描く ---- */
    draw() {
      if (this.root.hidden || !this.state.view) return;
      const g = this.g, W = this.W, H = this.H, v = this.state.view;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#05040c'; g.fillRect(0, 0, W, H);
      this.drawGrid();
      this.marks = [];
      const info = this.info || [];
      // ぬり（下に）→ 線 → 点
      info.forEach((o, i) => { if (this.visible(i) && ['yineq', 'xineq', 'implicit'].includes(o.kind) && o.op !== '=') this.drawRegion(o, this.state.rows[i].color); });
      info.forEach((o, i) => {
        if (!this.visible(i)) return;
        const c = this.state.rows[i].color, on = i === this.active;
        g.lineWidth = on ? 3 : 2.4; g.strokeStyle = c; g.setLineDash([]);
        g.shadowColor = c; g.shadowBlur = on ? 10 : 6;
        try {
          if (o.kind === 'fx' || o.kind === 'yineq') { if (o.op && (o.op === '<' || o.op === '>')) g.setLineDash([8, 6]); this.plotFx(o.fn); }
          else if (o.kind === 'fy' || o.kind === 'xineq') { if (o.op && (o.op === '<' || o.op === '>')) g.setLineDash([8, 6]); this.plotFy(o.fn); }
          else if (o.kind === 'implicit') { if (o.op === '<' || o.op === '>') g.setLineDash([6, 5]); this.plotImplicit(o.fn); }
        } catch (e) { /* 描けない所は飛ばす */ }
        g.shadowBlur = 0; g.setLineDash([]);
        if (o.kind === 'point' && isFinite(o.x) && isFinite(o.y)) {
          const x = this.sx(o.x), y = this.sy(o.y);
          g.fillStyle = c; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#05040c'; g.lineWidth = 2; g.stroke();
          this.label(x, y, `(${fmt(o.x, 4)}, ${fmt(o.y, 4)})`, c);
        }
      });
      this.findMarks();
      for (const m of this.marks) {
        const x = this.sx(m.x), y = this.sy(m.y);
        if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        g.fillStyle = '#9b97c9'; g.strokeStyle = '#05040c'; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
        if (this.labels.has(m.x.toFixed(9) + ',' + m.y.toFixed(9))) this.label(x, y, `${m.what}  (${fmt(m.x, 4)}, ${fmt(m.y, 4)})`, '#ece9ff');
      }
      if (this.trace && this.visible(this.trace.i)) {
        const t = this.trace, c = this.state.rows[t.i].color, x = this.sx(t.x), y = this.sy(t.y);
        g.fillStyle = c; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
        this.label(x, y, `(${fmt(t.x, 4)}, ${fmt(t.y, 4)})`, c);
      }
    }
    label(x, y, text, c) {
      const g = this.g;
      g.font = '600 12.5px "SF Mono", ui-monospace, Menlo, monospace';
      const w = g.measureText(text).width + 14, h = 24;
      let lx = x + 10, ly = y - h - 8;
      if (lx + w > this.W - 4) lx = x - w - 10;
      if (ly < 4) ly = y + 10;
      g.fillStyle = 'rgba(11,10,20,.88)'; g.strokeStyle = c; g.lineWidth = 1;
      g.beginPath(); if (g.roundRect) g.roundRect(lx, ly, w, h, 8); else g.rect(lx, ly, w, h); g.fill(); g.stroke();
      g.fillStyle = '#ece9ff'; g.textBaseline = 'middle'; g.fillText(text, lx + 7, ly + h / 2 + 0.5);
    }
    gridStep() {
      const v = this.state.view, target = 90 / v.s;
      const p = Math.pow(10, Math.floor(Math.log10(target)));
      for (const m of [1, 2, 5, 10]) if (m * p >= target) return { major: m * p, minor: m * p / (m === 2 ? 4 : 5) };
      return { major: 10 * p, minor: 2 * p };
    }
    drawGrid() {
      const g = this.g, W = this.W, H = this.H, { major, minor } = this.gridStep();
      const x0 = this.toX(0), x1 = this.toX(W), y0 = this.toY(H), y1 = this.toY(0);
      const lines = (step, color, width) => {
        g.strokeStyle = color; g.lineWidth = width; g.beginPath();
        for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { const px = Math.round(this.sx(x)) + 0.5; g.moveTo(px, 0); g.lineTo(px, H); }
        for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { const py = Math.round(this.sy(y)) + 0.5; g.moveTo(0, py); g.lineTo(W, py); }
        g.stroke();
      };
      if (this.state.grid) { lines(minor, 'rgba(150,130,255,.07)', 1); lines(major, 'rgba(150,130,255,.17)', 1); }
      // 軸
      const ax = this.sx(0), ay = this.sy(0);
      g.strokeStyle = 'rgba(236,233,255,.75)'; g.lineWidth = 1.5; g.beginPath();
      if (ax >= 0 && ax <= W) { g.moveTo(ax, 0); g.lineTo(ax, H); }
      if (ay >= 0 && ay <= H) { g.moveTo(0, ay); g.lineTo(W, ay); }
      g.stroke();
      // 目盛りの数
      g.font = '11.5px "SF Mono", ui-monospace, Menlo, monospace'; g.fillStyle = 'rgba(200,196,240,.85)';
      const lx = Math.min(W - 6, Math.max(6, ax)), ly = Math.min(H - 8, Math.max(8, ay));
      const nf = (v) => fmt(Math.abs(v) < major / 1e6 ? 0 : v, 6);
      g.textAlign = 'center'; g.textBaseline = ay > H - 24 ? 'bottom' : 'top';
      for (let x = Math.ceil(x0 / major) * major; x <= x1; x += major) {
        if (Math.abs(x) < major / 1e6) continue;
        const px = this.sx(x); g.fillText(nf(x), px, ay > H - 24 ? ly - 4 : ly + 4);
      }
      g.textBaseline = 'middle';
      const right = ax < 40;
      g.textAlign = right ? 'left' : 'right';
      for (let y = Math.ceil(y0 / major) * major; y <= y1; y += major) {
        if (Math.abs(y) < major / 1e6) continue;
        g.fillText(nf(y), right ? lx + 5 : lx - 5, this.sy(y));
      }
      if (ax >= 0 && ax <= W && ay >= 0 && ay <= H) { g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText('0', ax - 5, ay + 4); }
      g.textAlign = 'left';
    }
    plotFx(fn) {
      const g = this.g, W = this.W, H = this.H;
      g.beginPath();
      let pen = false, py0 = 0;
      for (let px = -1; px <= W + 1; px += 1) {
        const y = fn(this.toX(px));
        if (!isFinite(y)) { pen = false; continue; }
        const py = this.sy(y);
        // とびとびの所（tan の漸近線など）はつなげない
        if (pen && Math.abs(py - py0) > H * 1.5) pen = false;
        const cy = Math.max(-H * 4, Math.min(H * 5, py));
        if (pen) g.lineTo(px, cy); else g.moveTo(px, cy);
        pen = true; py0 = py;
      }
      g.stroke();
    }
    plotFy(fn) {
      const g = this.g, W = this.W, H = this.H;
      g.beginPath();
      let pen = false, px0 = 0;
      for (let py = -1; py <= H + 1; py += 1) {
        const x = fn(this.toY(py));
        if (!isFinite(x)) { pen = false; continue; }
        const px = this.sx(x);
        if (pen && Math.abs(px - px0) > W * 1.5) pen = false;
        const cx = Math.max(-W * 4, Math.min(W * 5, px));
        if (pen) g.lineTo(cx, py); else g.moveTo(cx, py);
        pen = true; px0 = px;
      }
      g.stroke();
    }
    // 陰関数：マス目ごとに符号を調べて、0 になる所を線でつなぐ（マーチングスクエア）
    plotImplicit(F) {
      const g = this.g, W = this.W, H = this.H, c = 4;
      const nx = Math.ceil(W / c) + 1, ny = Math.ceil(H / c) + 1;
      const v = new Float64Array(nx * ny);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = F(this.toX(i * c), this.toY(j * c));
      g.beginPath();
      const lerp = (a, b) => (Math.abs(a - b) < 1e-300 ? 0.5 : a / (a - b));
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = v[j * nx + i], b = v[j * nx + i + 1], d = v[(j + 1) * nx + i], e = v[(j + 1) * nx + i + 1];
        if (!isFinite(a) || !isFinite(b) || !isFinite(d) || !isFinite(e)) continue;
        const pts = [];
        const x = i * c, y = j * c;
        if ((a > 0) !== (b > 0)) pts.push([x + c * lerp(a, b), y]);
        if ((b > 0) !== (e > 0)) pts.push([x + c, y + c * lerp(b, e)]);
        if ((d > 0) !== (e > 0)) pts.push([x + c * lerp(d, e), y + c]);
        if ((a > 0) !== (d > 0)) pts.push([x, y + c * lerp(a, d)]);
        if (pts.length >= 2) {
          // 符号が変わっただけで値がとても大きい所（1/x の極など）は線にしない
          const big = Math.max(Math.abs(a), Math.abs(b), Math.abs(d), Math.abs(e));
          const small = Math.min(Math.abs(a), Math.abs(b), Math.abs(d), Math.abs(e));
          if (big > 1e6 && small > 1e3) continue;
          g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]);
          if (pts.length === 4) { g.moveTo(pts[2][0], pts[2][1]); g.lineTo(pts[3][0], pts[3][1]); }
        }
      }
      g.stroke();
    }
    drawRegion(o, color) {
      const g = this.g, W = this.W, H = this.H;
      g.save();
      g.globalAlpha = 0.18; g.fillStyle = color;
      const test = { '<': (a, b) => a < b, '>': (a, b) => a > b, '≤': (a, b) => a <= b, '≥': (a, b) => a >= b }[o.op];
      try {
        if (o.kind === 'yineq') {
          // y < f(x) なら線の下、y > f(x) なら線の上をぬる
          const below = o.op === '<' || o.op === '≤';
          g.beginPath();
          let open = false;
          for (let px = 0; px <= W; px += 2) {
            const y = o.fn(this.toX(px));
            if (!isFinite(y)) { if (open) { g.lineTo(px, below ? H : 0); g.closePath(); open = false; } continue; }
            const py = Math.max(-2, Math.min(H + 2, this.sy(y)));
            if (!open) { g.moveTo(px, below ? H : 0); open = true; }
            g.lineTo(px, py);
            if (px + 2 > W) { g.lineTo(px, below ? H : 0); g.closePath(); open = false; }
          }
          g.fill();
        } else if (o.kind === 'xineq') {
          const left = o.op === '<' || o.op === '≤';
          g.beginPath();
          let open = false;
          for (let py = 0; py <= H; py += 2) {
            const x = o.fn(this.toY(py));
            if (!isFinite(x)) { if (open) { g.lineTo(left ? 0 : W, py); g.closePath(); open = false; } continue; }
            const px = Math.max(-2, Math.min(W + 2, this.sx(x)));
            if (!open) { g.moveTo(left ? 0 : W, py); open = true; }
            g.lineTo(px, py);
            if (py + 2 > H) { g.lineTo(left ? 0 : W, py); g.closePath(); open = false; }
          }
          g.fill();
        } else {
          const c = 4;
          for (let y = 0; y < H; y += c) for (let x = 0; x < W; x += c) {
            const f = o.fn(this.toX(x + c / 2), this.toY(y + c / 2));
            if (isFinite(f) && test(f, 0)) g.fillRect(x, y, c, c);
          }
        }
      } catch (e) { /* 描けない */ }
      g.restore();
    }

    // 選んでいる式の、0 になる所・山と谷・y 軸と交わる所・ほかの線と交わる所（灰色の点）
    findMarks() {
      const o = this.info && this.info[this.active];
      if (!o || !this.visible(this.active) || o.kind !== 'fx') return;
      const f = o.fn, W = this.W, H = this.H, N = Math.min(600, Math.round(W));
      const xs = [], ys = [];
      for (let k = 0; k <= N; k++) { const x = this.toX(k * W / N); xs.push(x); let y; try { y = f(x); } catch (e) { y = NaN; } ys.push(y); }
      const span = (this.toY(0) - this.toY(H));
      const add = (x, y, what) => {
        if (!isFinite(x) || !isFinite(y)) return;
        if (this.marks.some((m) => Math.abs(this.sx(m.x) - this.sx(x)) < 3 && Math.abs(this.sy(m.y) - this.sy(y)) < 3)) return;
        if (this.marks.length < 60) this.marks.push({ x: Math.abs(x) < 1e-12 ? 0 : x, y: Math.abs(y) < 1e-12 ? 0 : y, what });
      };
      const bisect = (h, a, b) => { let fa = h(a); for (let k = 0; k < 60; k++) { const m = (a + b) / 2, fm = h(m); if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; } return (a + b) / 2; };
      // y 軸
      if (this.sx(0) >= 0 && this.sx(0) <= W) { try { add(0, f(0), 'y 切片'); } catch (e) { /* なし */ } }
      for (let k = 1; k <= N; k++) {
        const a = ys[k - 1], b = ys[k];
        if (!isFinite(a) || !isFinite(b)) continue;
        // 0 になる所（極の両側で符号が変わる所は入れない）
        if ((a > 0) !== (b > 0) && Math.abs(a - b) < span) { const x = bisect(f, xs[k - 1], xs[k]); add(x, 0, '0 になる所'); }
        else if (a === 0) add(xs[k - 1], 0, '0 になる所');
        // 山・谷
        if (k < N) {
          const c = ys[k + 1];
          if (isFinite(c) && ((b > a && b > c) || (b < a && b < c)) && Math.abs(b - a) < span / 2) {
            const isMax = b > a;
            let lo = xs[k - 1], hi = xs[k + 1];
            for (let it = 0; it < 60; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; const f1 = f(m1), f2 = f(m2); if ((f1 < f2) === isMax) lo = m1; else hi = m2; }
            const x = (lo + hi) / 2; add(x, f(x), isMax ? '山' : '谷');
          }
        }
      }
      // ほかの線と交わる所
      this.info.forEach((p, i) => {
        if (i === this.active || !this.visible(i) || p.kind !== 'fx') return;
        const h = (x) => f(x) - p.fn(x);
        let prev = null;
        for (let k = 0; k <= N; k++) {
          let d; try { d = h(xs[k]); } catch (e) { d = NaN; }
          if (prev !== null && isFinite(d) && isFinite(prev) && (d > 0) !== (prev > 0) && Math.abs(d - prev) < span) {
            const x = bisect(h, xs[k - 1], xs[k]); add(x, f(x), '交わる所');
          }
          prev = d;
        }
      });
    }
  }

  const EXAMPLES = [
    { name: '放物線と直線', rows: ['y=x^2-2', 'y=x', ''] },
    { name: '円', rows: ['x^2+y^2=r^2', 'r=4', ''] },
    { name: 'sin の波（a・b を動かす）', rows: ['y=a·sin(bx)', 'a=2', 'b=1', ''] },
    { name: '不等式', rows: ['y<x^2', 'y>-x-2', ''] },
    { name: '関数を作る', rows: ['f(x)=x^3-3x', 'y=f(x-1)+1', '(1,f(1))', ''] },
    { name: 'ハート', rows: ['(x^2+y^2-1)^3=x^2y^3', ''] },
  ];
  Graph.EXAMPLES = EXAMPLES;

  MS.Graph = Graph;
  MS.graphParse = { tokenize, analyzeAll, pretty, fmt };
})(window.MS);
