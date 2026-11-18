/* Mathspace — 式パーサと計算機 UI */
window.MS = window.MS || {};
(function (MS) {
  'use strict';

  /* ---------- 字句解析 ---------- */
  function tokenize(src) {
    const s = src.replace(/\*/g, '×').replace(/\//g, '÷').replace(/−/g, '-');
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === ',') { i++; continue; }
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
      if (m) { out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if (s.startsWith('mod', i)) { out.push({ t: 'op', v: 'mod' }); i += 3; continue; }
      if (c === 'π') { out.push({ t: 'num', v: Math.PI }); i++; continue; }
      if (c === '√') { out.push({ t: 'fn', v: '√' }); i++; continue; }
      if ('+-×÷^'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
      if ('%²!'.includes(c)) { out.push({ t: 'post', v: c }); i++; continue; }
      if (c === '(' || c === ')') { out.push({ t: c }); i++; continue; }
      throw new Error('読めない文字: ' + c);
    }
    return out;
  }

  function factorial(n) {
    if (!Number.isInteger(n) || n < 0) return NaN;
    if (n > 170) return Infinity;
    let r = 1;
    for (let k = 2; k <= n; k++) r *= k;
    return r;
  }

  /* ---------- 再帰下降パーサ ---------- */
  function evaluate(src) {
    const tk = tokenize(src);
    let p = 0;
    const peek = () => tk[p];
    const next = () => tk[p++];

    function expr() {
      let v = term();
      while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        const op = next().v;
        const r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    function term() {
      let v = unary();
      for (;;) {
        const t = peek();
        if (!t) break;
        if (t.t === 'op' && (t.v === '×' || t.v === '÷' || t.v === 'mod')) {
          next();
          const r = unary();
          if (t.v === '×') v *= r;
          else if (t.v === '÷') v /= r;
          else v = ((v % r) + r) % r;
        } else if (t.t === 'num' || t.t === '(' || t.t === 'fn') {
          v *= unary(); // 暗黙の掛け算: 2π, 3(4+1)
        } else break;
      }
      return v;
    }
    function unary() {
      const t = peek();
      if (t && t.t === 'op' && t.v === '-') { next(); return -unary(); }
      if (t && t.t === 'op' && t.v === '+') { next(); return unary(); }
      return power();
    }
    function power() {
      const b = postfix();
      const t = peek();
      if (t && t.t === 'op' && t.v === '^') { next(); return Math.pow(b, unary()); }
      return b;
    }
    function postfix() {
      let v = primary();
      while (peek() && peek().t === 'post') {
        const op = next().v;
        if (op === '%') v = v / 100;
        else if (op === '²') v = v * v;
        else v = factorial(v);
      }
      return v;
    }
    function primary() {
      const t = next();
      if (!t) throw new Error('式が途中です');
      if (t.t === 'num') return t.v;
      if (t.t === 'fn') return Math.sqrt(postfix());
      if (t.t === '(') {
        const v = expr();
        if (peek() && peek().t === ')') next(); // 閉じ忘れは許す
        return v;
      }
      throw new Error('式が正しくありません');
    }

    if (!tk.length) throw new Error('空の式');
    const v = expr();
    if (p < tk.length) throw new Error('式が正しくありません');
    return v;
  }

  /** 入力途中の式でもなるべく評価する (末尾の演算子を無視) */
  function tryEvaluate(src) {
    let s = src.trim();
    for (let n = 0; n < 4 && s; n++) {
      try {
        const v = evaluate(s);
        return MS.clean(v);
      } catch (e) {
        s = s.replace(/(mod|[+\-×÷^√(])\s*$/, '');
      }
    }
    return null;
  }

  /* ---------- 計算機 UI ---------- */
  const KEYS = [
    ['C', 'clear'], ['(', '('], [')', ')'], ['⌫', 'back'],
    ['π', 'π'], ['√', '√'], ['x²', '²'], ['xʸ', '^'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '÷'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['×', '×'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['−', '-'],
    ['0', '0'], ['.', '.'], ['%', '%'], ['+', '+'],
    ['±', 'neg'], ['mod', 'mod'], ['=', 'eq'],
  ];

  class Calculator {
    constructor(opts) {
      this.exprEl = opts.exprEl;
      this.resultEl = opts.resultEl;
      this.keysEl = opts.keysEl;
      this.historyEl = opts.historyEl;
      this.onEvaluate = opts.onEvaluate || (() => {});
      this.expr = '';
      this.last = 0;
      this.justEval = false;
      this.history = [];
      this.buildKeys();
      this.render();
    }

    buildKeys() {
      this.keysEl.innerHTML = '';
      for (const [label, k] of KEYS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'key';
        b.textContent = label;
        b.dataset.k = k;
        if (/^[0-9.]$/.test(k)) b.classList.add('num');
        else if (k === 'eq') b.classList.add('eq');
        else if (k === 'clear' || k === 'back') b.classList.add('fn');
        else b.classList.add('op');
        b.addEventListener('click', () => this.press(k));
        this.keysEl.appendChild(b);
      }
    }

    get value() {
      if (this.justEval || !this.expr) return this.last;
      const v = tryEvaluate(this.expr);
      return MS.isValid(v) ? v : this.last;
    }

    press(k) {
      const isDigit = /^[0-9.]$/.test(k);
      if (k === 'clear') { this.expr = ''; this.justEval = false; this.last = 0; return this.render(); }
      if (k === 'back') {
        if (this.justEval) { this.justEval = false; }
        this.expr = this.expr.endsWith('mod') ? this.expr.slice(0, -3) : this.expr.slice(0, -1);
        return this.render();
      }
      if (k === 'eq') return this.equals();
      if (k === 'neg') return this.negate();

      if (this.justEval) {
        // 結果の直後: 数字なら新しい式、演算子なら結果から続ける
        if (isDigit || k === 'π' || k === '√' || k === '(') this.expr = '';
        else this.expr = MS.raw(this.last);
        this.justEval = false;
      }
      if (k === '.') {
        const m = /(\d*\.?\d*)$/.exec(this.expr);
        if (m && m[0].includes('.')) return;
        if (!m || !m[0]) { this.expr += '0.'; return this.render(); }
      }
      this.expr += k;
      this.render();
    }

    negate() {
      if (this.justEval) {
        this.last = -this.last;
        this.exprEl.dataset.done = '-(' + (this.exprEl.dataset.done || '') + ')';
        return this.render();
      }
      const wrapped = /\(-([\d.e]+)\)$/.exec(this.expr);
      if (wrapped) {
        this.expr = this.expr.slice(0, -wrapped[0].length) + wrapped[1];
      } else {
        const m = /([\d.]+(e[+-]?\d+)?|π)$/.exec(this.expr);
        if (m) this.expr = this.expr.slice(0, -m[0].length) + '(-' + m[0] + ')';
        else this.expr += '(-';
      }
      this.render();
    }

    equals() {
      if (!this.expr) return;
      let v;
      try { v = MS.clean(evaluate(this.expr)); } catch (e) { v = tryEvaluate(this.expr); }
      if (v === null || typeof v !== 'number' || isNaN(v)) {
        this.flash('計算できません');
        return;
      }
      const expr = this.expr;
      this.last = v;
      this.justEval = true;
      this.pushHistory(expr, v);
      this.render(expr);
      this.onEvaluate(v, expr);
    }

    /** 外部 (ぷに) から数値を入れる */
    insertValue(v, op) {
      const s = MS.raw(v);
      const token = v < 0 ? '(' + s + ')' : s;
      if (this.justEval || !this.expr) {
        this.expr = (this.justEval && op) ? MS.raw(this.last) + op + token : token;
        this.justEval = false;
      } else if (/(mod|[+\-×÷^√(])$/.test(this.expr)) {
        this.expr += token;
      } else {
        this.expr += (op || '+') + token;
      }
      this.render();
    }

    pushHistory(expr, v) {
      this.history.unshift({ expr, v });
      this.history = this.history.slice(0, 30);
      this.renderHistory();
    }

    /** 履歴の式を計算機に戻す (戻せない式なら答えの数を入れる) */
    loadExpr(expr, v) {
      const ok = tryEvaluate(expr) !== null && /^[0-9.e+\-×÷^√π%²!()mod ]+$/.test(expr);
      this.expr = ok ? expr : MS.raw(v);
      this.justEval = false;
      this.render();
    }

    clearHistory() {
      this.history = [];
      this.renderHistory();
    }

    addExternalHistory(expr, v) {
      this.pushHistory(expr, v);
    }

    renderHistory() {
      if (!this.historyEl) return;
      this.historyEl.innerHTML = '';
      for (const h of this.history) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'hist';
        b.innerHTML = '<span></span><b></b>';
        b.firstChild.textContent = pretty(h.expr) + ' =';
        b.lastChild.textContent = MS.fmt(h.v);
        b.dataset.value = h.v;
        this.historyEl.appendChild(b);
        if (this.historyEl.children.length >= 12) break;
      }
      if (this.onHistoryRender) this.onHistoryRender(this.historyEl);
    }

    flash(msg) {
      this.resultEl.classList.add('err');
      this.resultEl.textContent = msg;
      clearTimeout(this._ft);
      this._ft = setTimeout(() => { this.resultEl.classList.remove('err'); this.render(); }, 900);
    }

    render(doneExpr) {
      if (this.justEval) {
        this.exprEl.textContent = pretty(doneExpr || this.exprEl.dataset.done || '') + ' =';
        if (doneExpr) this.exprEl.dataset.done = doneExpr;
        this.resultEl.textContent = MS.fmt(this.last);
        this.resultEl.classList.remove('typing');
      } else {
        // = を押すまでは、入力中の式 (+ − × ÷ も) を大きく表示する
        this.exprEl.textContent = ' ';
        if (this.expr) this.resultEl.innerHTML = tight(this.expr);
        else this.resultEl.textContent = MS.fmt(this.last);
        this.resultEl.classList.toggle('typing', !!this.expr);
      }
      fitText(this.resultEl);
    }
  }

  function pretty(s) {
    const ex = [];
    s = s.replace(/(\d)e([+-]?\d+)/g, (m, a, b) => { ex.push(b); return a + 'E§' + (ex.length - 1) + '§'; });
    s = s.replace(/-/g, '−').replace(/mod/g, ' mod ').replace(/([+−×÷^])/g, ' $1 ').replace(/\s+/g, ' ').trim()
      .replace(/\( − /g, '(−').replace(/^− /, '−');
    return s.replace(/E§(\d+)§/g, (m, i) => 'e' + ex[+i]);
  }

  /** 大きい表示用: 余分な空白を入れず、演算子だけ少し間をあける */
  function tight(s) {
    const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return pretty(s).split(' ').filter(Boolean).map((t) =>
      /^(\+|−|×|÷|\^|mod)$/.test(t) ? `<span class="op">${esc(t)}</span>` : esc(t)).join('');
  }

  /** 枠に収まるまで文字を小さくし、それでも長ければ末尾 (今打っている所) を見せる */
  function fitText(el) {
    let size = 46;
    el.style.fontSize = size + 'px';
    while (size > 22 && el.scrollWidth > el.clientWidth + 1) {
      size -= 2;
      el.style.fontSize = size + 'px';
    }
    el.scrollLeft = el.scrollWidth;
  }

  MS.evaluate = evaluate;
  MS.tryEvaluate = tryEvaluate;
  MS.factorial = factorial;
  MS.Calculator = Calculator;
  MS.prettyExpr = pretty;
})(window.MS);
