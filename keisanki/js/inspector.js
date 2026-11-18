/* Mathspace — 数字インスペクタ (分解・変換・生成・シミュレーション・可視化) */
window.MS = window.MS || {};
(function (MS) {
  'use strict';

  const L = () => MS.lab;
  const fmt = (v) => MS.fmt(v);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sup = (e) => String(e).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'['0123456789'.indexOf(c)] || c).join('');

  /** 数字チップ: タップでぷに化、ドラッグで空間へ、→で調べる */
  function chip(label, v, unit) {
    if (!MS.isValid(v)) return '';
    v = MS.clean(v);
    return `<div class="nchip" data-v="${v}">` +
      `<button type="button" class="nchip-main" data-v="${v}" title="タップでぷに化 / ドラッグで空間へ">` +
      (label ? `<span class="k">${esc(label)}</span>` : '') +
      `<b>${esc(fmt(v))}</b>` + (unit ? `<span class="u">${esc(unit)}</span>` : '') +
      `</button><button type="button" class="nchip-go" data-v="${v}" title="この数を調べる" aria-label="${esc(fmt(v))} を調べる">›</button></div>`;
  }
  const chips = (arr) => `<div class="chips">${arr.join('')}</div>`;
  const card = (title, body, note) =>
    `<section class="card"><h3>${esc(title)}</h3>${note ? `<p class="note">${note}</p>` : ''}${body}</section>`;

  /* ================= 分解 ================= */
  function decompose(v) {
    const lab = L();
    const out = [];
    const a = Math.abs(v);

    if (lab.isInt(v)) {
      // 位取り
      const s = String(a);
      const terms = [];
      for (let i = 0; i < s.length; i++) {
        const d = +s[i];
        if (d) terms.push(d * Math.pow(10, s.length - 1 - i));
      }
      if (terms.length) {
        const text = terms.map((t) => fmt(t)).join(' + ');
        out.push(card('位ごとに分ける', `<p class="eq">${esc(fmt(a))} = ${esc(text)}</p>` + chips(terms.map((t) => chip('', t)))));
      }

      // 素因数分解
      if (a >= 2) {
        const f = lab.factorize(a);
        if (f) {
          if (f.length === 1 && f[0][1] === 1) {
            out.push(card('素因数分解', `<p class="eq">${esc(fmt(a))} は <em>素数</em>。これ以上は分けられない、数の原子です。</p>` +
              chips([chip('前の素数', lab.prevPrime(a)), chip('次の素数', lab.nextPrime(a))].filter(Boolean))));
          } else {
            const text = f.map(([p, e]) => fmt(p) + (e > 1 ? sup(e) : '')).join(' × ');
            out.push(card('素因数分解', `<p class="eq">${esc(fmt(a))} = ${esc(text)}</p>` +
              chips(f.map(([p, e]) => chip(e > 1 ? `${fmt(p)}${sup(e)}` : '素数', Math.pow(p, e))))));
          }
        } else {
          out.push(card('素因数分解', '<p class="note">大きすぎてこの場では分解できません (10¹⁵ まで)。</p>'));
        }

        // 約数
        const ds = lab.divisors(a);
        if (ds) {
          const sum = ds.reduce((x, y) => x + y, 0);
          const shown = ds.slice(0, 40);
          out.push(card(`約数 (${ds.length}個)`,
            chips(shown.map((d) => chip('', d))) +
            (ds.length > shown.length ? `<p class="note">…ほか ${ds.length - shown.length} 個</p>` : '') +
            `<p class="note">約数の合計: ${esc(fmt(sum))}</p>`));

          // 掛け算のペア
          const pairs = [];
          for (const d of ds) { if (d * d > a) break; pairs.push([d, a / d]); }
          out.push(card('掛け算に分ける', `<p class="eq small">${pairs.slice(0, 14).map(([x, y]) => `${fmt(x)} × ${fmt(y)}`).join('<br>')}</p>`));
        }
      }

      // 足し算に分ける
      const sums = [];
      if (a >= 2) sums.push(['半分ずつ', `${fmt(a / 2)} + ${fmt(a / 2)}`, [chip('半分', a / 2)]]);
      const gb = lab.goldbach(a);
      if (gb) sums.push(['素数 + 素数', `${fmt(gb[0])} + ${fmt(gb[1])}`, [chip('', gb[0]), chip('', gb[1])]]);
      const sq = lab.twoSquares(a);
      if (sq) sums.push(['平方数 + 平方数', `${fmt(sq[0])}² + ${fmt(sq[1])}²`, [chip(`${sq[0]}²`, sq[0] * sq[0]), chip(`${sq[1]}²`, sq[1] * sq[1])]]);
      if (a >= 3 && a <= 2 ** 52) {
        const bits = a.toString(2);
        const pw = [];
        for (let i = 0; i < bits.length; i++) if (bits[i] === '1') pw.push(Math.pow(2, bits.length - 1 - i));
        if (pw.length > 1) sums.push(['2の累乗の和', pw.map((p) => fmt(p)).join(' + '), pw.slice(0, 8).map((p) => chip('', p))]);
      }
      if (sums.length) {
        out.push(card('足し算に分ける', sums.map(([k, t, cs]) =>
          `<div class="row"><span class="rk">${esc(k)}</span><span class="eq small">${esc(t)}</span></div>` + chips(cs)).join('')));
      }

      const ds2 = lab.digitSum(a);
      if (s.length > 1) {
        let root = a % 9 === 0 ? 9 : a % 9;
        if (a === 0) root = 0;
        out.push(card('数字のかけら', chips([chip('各桁の和', ds2), chip('数字根', root), chip('逆さ', lab.reverseDigits(a)), chip('桁数', s.length)])));
      }
    } else {
      // 小数
      const ip = Math.trunc(v), fp = MS.clean(v - ip);
      out.push(card('整数部と小数部', `<p class="eq">${esc(fmt(v))} = ${esc(fmt(ip))} + ${esc(fmt(fp))}</p>` + chips([chip('整数部', ip), chip('小数部', fp)])));
      const fr = lab.toFraction(v);
      if (fr) {
        out.push(card('分数にする', `<p class="eq">${esc(fmt(v))} ${fr.exact ? '=' : '≈'} ${fr.num} / ${fr.den}</p>` + chips([chip('分子', fr.num), chip('分母', fr.den)])));
      }
      const m = /^-?(\d+)\.(\d+)$/.exec(String(MS.clean(a)));
      if (m) {
        const terms = [];
        const is = m[1], fs = m[2].slice(0, 8);
        for (let i = 0; i < is.length; i++) { const d = +is[i]; if (d) terms.push(d * Math.pow(10, is.length - 1 - i)); }
        for (let i = 0; i < fs.length; i++) { const d = +fs[i]; if (d) terms.push(MS.clean(d * Math.pow(10, -(i + 1)))); }
        out.push(card('位ごとに分ける', `<p class="eq small">${esc(terms.map(fmt).join(' + '))}</p>` + chips(terms.map((t) => chip('', t)))));
      }
    }
    if (v < 0) out.push(card('符号', `<p class="eq">${esc(fmt(v))} = −1 × ${esc(fmt(a))}</p>` + chips([chip('絶対値', a), chip('', -1)])));
    if (v === 0) out.push(card('ゼロ', '<p class="eq">0 は何を掛けても 0 になる、特別な数。</p>'));
    return out.join('');
  }

  /* ================= 変換 ================= */
  function convert(v) {
    const lab = L();
    const reps = lab.representations(v);
    let html = '';
    if (reps.length) {
      html += card('表し方を変える', `<dl class="reps">${reps.map(([k, s]) => `<dt>${esc(k)}</dt><dd>${esc(s)}</dd>`).join('')}</dl>`);
    }
    html += `<p class="note pad">同じ <b>${esc(fmt(v))}</b> を、いろいろな単位として読んでみる。</p>`;
    for (const g of lab.conversions(v)) {
      html += card(`${g.name}: ${fmt(v)} ${g.base}`, chips(g.items.map(([k, x, u]) => chip(k, x, u))));
    }
    return html;
  }

  /* ================= 生成 ================= */
  function generate(v) {
    const lab = L();
    const a = Math.abs(v);
    const isInt = lab.isInt(v);
    const basic = [
      chip('+1', v + 1), chip('−1', v - 1), chip('2倍', v * 2), chip('半分', v / 2),
      chip('2乗', v * v), chip('3乗', v * v * v),
      v >= 0 ? chip('√', Math.sqrt(v)) : '', chip('∛', Math.cbrt(v)),
      v !== 0 ? chip('逆数', 1 / v) : '', chip('符号反転', -v),
      chip('× π', v * Math.PI), v > 0 ? chip('ln', Math.log(v)) : '', v > 0 ? chip('log₁₀', Math.log10(v)) : '',
      Math.abs(v) <= 1023 ? chip('2ⁿ', Math.pow(2, v)) : '', Math.abs(v) <= 300 ? chip('10ⁿ', Math.pow(10, v)) : '',
      chip('税込 (10%)', v * 1.1), chip('10% 引き', v * 0.9),
    ];
    let html = card('ひとつの数から', chips(basic));

    const seqs = [];
    if (isInt && v >= 0 && v <= 170) seqs.push(chip(`${v}!`, MS.factorial(v)));
    if (isInt && v >= 0) seqs.push(chip('三角数 T(n)', v * (v + 1) / 2));
    if (isInt && v >= 1) { const p = lab.nthPrime(v); if (p) seqs.push(chip(`${fmt(v)}番目の素数`, p)); }
    if (isInt && v >= 0) { const f = lab.fibN(v); if (f !== null) seqs.push(chip(`${fmt(v)}番目のフィボナッチ`, f)); }
    const np = lab.nextPrime(v); if (np) seqs.push(chip('次の素数', np));
    const pp = lab.prevPrime(v); if (pp) seqs.push(chip('前の素数', pp));
    if (isInt && a >= 10) seqs.push(chip('逆さ数字', lab.reverseDigits(v)));
    if (seqs.length) html += card('数列・数論から', chips(seqs));

    const mult = [];
    for (let k = 2; k <= 9; k++) mult.push(chip(`×${k}`, v * k));
    html += card('倍数', chips(mult));

    const powers = [];
    for (let k = 2; k <= 6; k++) powers.push(chip(`${sup(k)}`, Math.pow(v, k)));
    if (v > 0) for (let k = 2; k <= 4; k++) powers.push(chip(`${k}乗根`, Math.pow(v, 1 / k)));
    html += card('べき乗・累乗根', chips(powers));

    html += card('偶然から生む',
      `<div class="rand-row"><button type="button" class="btn" data-act="rand">🎲 ${isInt && v >= 1 ? `1〜${esc(fmt(v))} から` : `0〜${esc(fmt(v))} の範囲で`}ひとつ</button></div><div class="chips" data-slot="rand"></div>`);
    return html;
  }

  /* ================= シミュレーション ================= */
  function simulate(v) {
    const lab = L();
    let html = '';
    html += card('成長・減衰シミュレーション',
      `<div class="ctrl"><label>1回あたりの変化率 <output data-o="rate">5%</output></label><input type="range" min="-30" max="50" step="0.5" value="5" data-i="rate"></div>` +
      `<div class="ctrl"><label>回数 (年・月・日…) <output data-o="n">10</output></label><input type="range" min="1" max="60" step="1" value="10" data-i="n"></div>` +
      `<div class="chart" data-chart="growth"></div><div class="chips" data-slot="growth"></div>`,
      `<b>${esc(fmt(v))}</b> を出発点に、毎回同じ割合で増える(減る)とどうなる?`);

    const T = lab.isInt(v) && v >= 1 ? Math.min(v, 100000) : 100;
    html += card('確率の実験',
      `<div class="seg" data-seg="mode"><button type="button" class="on" data-m="coin">コイン</button><button type="button" data-m="dice">サイコロ</button></div>` +
      `<div class="rand-row"><button type="button" class="btn" data-act="trial">▶ ${esc(fmt(T))} 回 試す</button></div>` +
      `<div class="chart" data-chart="trial"></div><div class="chips" data-slot="trial"></div>`,
      lab.isInt(v) && v >= 1 ? `<b>${esc(fmt(T))}</b> 回 投げると、確率はどこへ近づく?` : 'この数は回数にできないので 100 回で試します。');

    if (lab.isInt(v) && v >= 1) {
      const p = lab.birthday(v);
      html += card('誕生日のパラドックス',
        `<p class="eq">${esc(fmt(v))} 人いると、同じ誕生日の 2 人がいる確率は <em>${(p * 100).toFixed(p > 0.999 || p < 0.001 ? 3 : 1)}%</em></p>` +
        `<div class="chart" data-chart="bday"></div>` + chips([chip('確率 (%)', p * 100)]),
        '直感よりずっと早く 50% を超える、有名な確率の話。');
    }
    if (lab.isInt(v) && v >= 2 && v <= 1e12) {
      const seq = lab.collatz(v);
      const max = Math.max(...seq);
      html += card('コラッツの旅',
        `<div class="chart" data-chart="collatz"></div>` +
        chips([chip('ステップ数', seq.length - 1), chip('最高到達点', max)]),
        '偶数なら半分、奇数なら 3 倍して +1。どんな数も最後は 1 にたどり着く…と予想されている(未解決)。');
    }
    return html;
  }

  /* ================= 可視化 ================= */
  function visualize(v) {
    const lab = L();
    let html = '';
    html += card('量として見る', '<canvas class="dots" data-viz="dots"></canvas><p class="note" data-slot="dots"></p>');
    if (v !== 0) html += card('スケールの中で見る', '<div class="chart" data-chart="scale"></div><div data-slot="scale"></div>', '関連するデータと比べて、どのくらいの大きさ?');
    if (lab.isInt(v) && Math.abs(v) >= 4 && Math.abs(v) <= 1e9) {
      const ds = lab.divisors(Math.abs(v));
      if (ds && ds.length > 2) html += card('同じ面積の長方形', '<div class="chart" data-chart="rects"></div>', '面積がすべて同じ — 約数のペアの形。');
    }
    if (lab.isInt(v) && v !== 0 && Math.abs(v) < 2 ** 40) html += card('ビット (2進数の光)', '<div class="bits" data-viz="bits"></div>');
    const digits = String(MS.clean(Math.abs(v))).replace(/[^0-9]/g, '');
    if (digits.length > 1 && !/e/.test(String(v))) html += card('桁の虹', '<div class="chart" data-chart="rainbow"></div>');
    if (!Number.isInteger(v)) html += card('小数部の円', '<div class="chart" data-chart="pie"></div>');
    return html;
  }

  /* ================= SVG ヘルパー ================= */
  function lineChart(series, opt = {}) {
    const W = opt.w || 340, H = opt.h || 160, P = { l: 44, r: 10, t: 10, b: 22 };
    let xs = [], ys = [];
    for (const s of series) for (const [x, y] of s.pts) { xs.push(x); ys.push(y); }
    let x0 = Math.min(...xs), x1 = Math.max(...xs);
    let y0 = opt.y0 != null ? opt.y0 : Math.min(...ys), y1 = opt.y1 != null ? opt.y1 : Math.max(...ys);
    const logY = opt.logY && y0 > 0;
    const ty = (y) => logY ? Math.log10(y) : y;
    let ly0 = ty(y0), ly1 = ty(y1);
    if (ly1 === ly0) { ly1 += 1; ly0 -= logY ? 0 : 1; }
    if (x1 === x0) x1 = x0 + 1;
    const X = (x) => P.l + (x - x0) / (x1 - x0) * (W - P.l - P.r);
    const Y = (y) => H - P.b - (ty(y) - ly0) / (ly1 - ly0) * (H - P.t - P.b);
    let g = `<svg viewBox="0 0 ${W} ${H}" class="svg-chart" role="img">`;
    for (let i = 0; i <= 4; i++) {
      const yy = P.t + i / 4 * (H - P.t - P.b);
      g += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" class="grid"/>`;
    }
    const yl = (y) => MS.short(y);
    g += `<text x="${P.l - 6}" y="${P.t + 4}" class="ax" text-anchor="end">${esc(yl(y1))}</text>`;
    g += `<text x="${P.l - 6}" y="${H - P.b}" class="ax" text-anchor="end">${esc(yl(y0))}</text>`;
    g += `<text x="${P.l}" y="${H - 6}" class="ax">${esc(MS.short(x0))}</text>`;
    g += `<text x="${W - P.r}" y="${H - 6}" class="ax" text-anchor="end">${esc(MS.short(x1))}${opt.xUnit ? esc(opt.xUnit) : ''}</text>`;
    for (const s of series) {
      const d = s.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(Math.max(y, logY ? y0 : -Infinity)).toFixed(1)}`).join('');
      if (s.fill) g += `<path d="${d}L${X(s.pts[s.pts.length - 1][0])},${H - P.b}L${X(s.pts[0][0])},${H - P.b}Z" fill="${s.color}" opacity="0.14"/>`;
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dash ? 'stroke-dasharray="4 4"' : ''} stroke-linejoin="round"/>`;
    }
    if (opt.hline != null) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(opt.hline)}" y2="${Y(opt.hline)}" class="hline"/>`;
    if (opt.marker) {
      const [mx, my] = opt.marker;
      g += `<circle cx="${X(mx)}" cy="${Y(my)}" r="5" class="marker"/>`;
    }
    if (opt.legend) {
      let lx = P.l + 6;
      for (const s of series) {
        if (!s.name) continue;
        g += `<rect x="${lx}" y="${P.t + 4}" width="10" height="3" fill="${s.color}"/><text x="${lx + 14}" y="${P.t + 9}" class="ax">${esc(s.name)}</text>`;
        lx += 18 + s.name.length * 11;
      }
    }
    return g + '</svg>';
  }

  function barChart(bars, opt = {}) {
    const W = opt.w || 340, H = opt.h || 140, P = { l: 8, r: 8, t: 16, b: 22 };
    const max = Math.max(...bars.map((b) => b.v), 1e-9);
    const bw = (W - P.l - P.r) / bars.length;
    let g = `<svg viewBox="0 0 ${W} ${H}" class="svg-chart" role="img">`;
    bars.forEach((b, i) => {
      const h = b.v / max * (H - P.t - P.b);
      const x = P.l + i * bw + bw * 0.14;
      g += `<rect x="${x}" y="${H - P.b - h}" width="${bw * 0.72}" height="${h}" rx="3" fill="${b.color}"/>`;
      g += `<text x="${x + bw * 0.36}" y="${H - 6}" class="ax" text-anchor="middle">${esc(b.label)}</text>`;
      if (b.top) g += `<text x="${x + bw * 0.36}" y="${H - P.b - h - 4}" class="ax" text-anchor="middle">${esc(b.top)}</text>`;
    });
    return g + '</svg>';
  }

  const C1 = '#5ef1ff', C2 = '#b48cff', C3 = '#ff6bd6', C4 = '#ffd36b';

  /* ================= インスペクタ本体 ================= */
  class Inspector {
    constructor(root, cb) {
      this.root = root;
      this.cb = cb; // { spawn(v, el), toCalc(v), close() }
      this.tab = 'decompose';
      this.stack = [];
      this.value = null;
      this.mode = 'coin';
      root.addEventListener('click', (e) => this.onClick(e));
      root.addEventListener('input', (e) => this.onInput(e));
    }

    open(v, push = true) {
      v = MS.clean(v);
      if (!MS.isValid(v)) return;
      if (push && this.value !== null && this.value !== v && !this.root.hidden) this.stack.push(this.value);
      if (!push) this.stack = [];
      this.value = v;
      this.root.hidden = false;
      requestAnimationFrame(() => this.root.classList.add('open'));
      this.render();
    }

    close() {
      this.root.classList.remove('open');
      this.stack = [];
      setTimeout(() => { if (!this.root.classList.contains('open')) this.root.hidden = true; }, 260);
      this.cb.close && this.cb.close();
    }

    render() {
      const v = this.value;
      const tags = L().tags(v);
      const tabs = [['decompose', '分解'], ['convert', '変換'], ['generate', '生成'], ['simulate', 'シミュ'], ['visualize', '可視化']];
      this.root.innerHTML =
        `<div class="insp-head">` +
          `<div class="insp-top">${this.stack.length ? `<button type="button" class="ibtn" data-act="back" aria-label="戻る">‹ ${esc(MS.short(this.stack[this.stack.length - 1]))}</button>` : '<span class="insp-label">NUMBER</span>'}` +
          `<button type="button" class="ibtn" data-act="close" aria-label="閉じる">✕</button></div>` +
          `<div class="insp-num" style="--h:${MS.blobHue(v)}">${esc(fmt(v))}</div>` +
          `<div class="insp-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` +
          `<div class="insp-actions"><button type="button" class="btn glow" data-act="puni">◉ ぷに化</button><button type="button" class="btn" data-act="calc">⌨ 計算機へ</button></div>` +
        `</div>` +
        `<nav class="insp-tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" class="${k === this.tab ? 'on' : ''}" aria-selected="${k === this.tab}">${t}</button>`).join('')}</nav>` +
        `<div class="insp-body">${this.body()}</div>`;
      this.afterRender();
      if (this.cb.rendered) this.cb.rendered(this.root);
    }

    body() {
      const v = this.value;
      try {
        switch (this.tab) {
          case 'decompose': return decompose(v);
          case 'convert': return convert(v);
          case 'generate': return generate(v);
          case 'simulate': return simulate(v);
          case 'visualize': return visualize(v);
        }
      } catch (e) {
        console.error(e);
        return '<p class="note pad">この数ではうまく計算できませんでした。</p>';
      }
      return '';
    }

    $(sel) { return this.root.querySelector(sel); }

    afterRender() {
      if (this.tab === 'simulate') { this.drawGrowth(); this.drawBirthday(); this.drawCollatz(); }
      if (this.tab === 'visualize') { this.drawDots(); this.drawScale(); this.drawRects(); this.drawBits(); this.drawRainbow(); this.drawPie(); }
    }

    onClick(e) {
      const t = e.target.closest('button');
      if (!t || !this.root.contains(t)) return;
      if (t.dataset.tab) { this.tab = t.dataset.tab; this.render(); this.root.querySelector('.insp-body').scrollTop = 0; return; }
      if (t.classList.contains('nchip-go')) { this.open(parseFloat(t.dataset.v)); return; }
      if (t.classList.contains('nchip-main')) {
        if (t._dragged) { t._dragged = false; return; }
        this.cb.spawn(parseFloat(t.dataset.v), t);
        return;
      }
      if (t.dataset.m) {
        this.mode = t.dataset.m;
        t.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === t));
        return;
      }
      switch (t.dataset.act) {
        case 'close': this.close(); break;
        case 'back': { const p = this.stack.pop(); this.value = p; this.render(); break; }
        case 'puni': this.cb.spawn(this.value, t); break;
        case 'calc': this.cb.toCalc(this.value); break;
        case 'rand': this.rollRandom(); break;
        case 'trial': this.runTrial(); break;
      }
    }

    onInput(e) {
      const i = e.target;
      if (i.dataset.i === 'rate' || i.dataset.i === 'n') this.drawGrowth();
    }

    rollRandom() {
      const v = this.value;
      const slot = this.$('[data-slot="rand"]');
      if (!slot) return;
      const r = L().isInt(v) && v >= 1 ? 1 + Math.floor(Math.random() * v) : MS.clean(Math.random() * v);
      slot.insertAdjacentHTML('afterbegin', chip('', r));
      while (slot.children.length > 8) slot.lastChild.remove();
      if (this.cb.rendered) this.cb.rendered(this.root);
    }

    drawGrowth() {
      const el = this.$('[data-chart="growth"]');
      if (!el) return;
      const rate = parseFloat(this.$('[data-i="rate"]').value);
      const n = parseInt(this.$('[data-i="n"]').value, 10);
      this.$('[data-o="rate"]').textContent = (rate > 0 ? '+' : '') + rate + '%';
      this.$('[data-o="n"]').textContent = n + '回';
      const v = this.value;
      const comp = [], simp = [];
      for (let k = 0; k <= n; k++) {
        comp.push([k, v * Math.pow(1 + rate / 100, k)]);
        simp.push([k, v * (1 + rate / 100 * k)]);
      }
      el.innerHTML = lineChart([
        { pts: simp, color: C2, dash: true, name: '単利' },
        { pts: comp, color: C1, fill: true, name: '複利' },
      ], { legend: true, xUnit: '回' });
      const fin = comp[comp.length - 1][1];
      const items = [chip(`${n}回後 (複利)`, fin), chip(`${n}回後 (単利)`, simp[simp.length - 1][1]), chip('増えた分', fin - v)];
      if (rate > 0) items.push(chip('2倍になる回数', Math.log(2) / Math.log(1 + rate / 100)));
      if (rate < 0) items.push(chip('半分になる回数', Math.log(0.5) / Math.log(1 + rate / 100)));
      this.$('[data-slot="growth"]').innerHTML = items.join('');
      if (this.cb.rendered) this.cb.rendered(this.root);
    }

    runTrial() {
      const v = this.value;
      const T = L().isInt(v) && v >= 1 ? Math.min(v, 100000) : 100;
      const dice = this.mode === 'dice';
      const faces = dice ? 6 : 2;
      const counts = new Array(faces).fill(0);
      const run = [];
      const step = Math.max(1, Math.floor(T / 200));
      let hits = 0;
      for (let i = 1; i <= T; i++) {
        const r = Math.floor(Math.random() * faces);
        counts[r]++;
        if (r === 0) hits++;
        if (i % step === 0 || i === T) run.push([i, hits / i * 100]);
      }
      const expect = 100 / faces;
      const labels = dice ? ['1', '2', '3', '4', '5', '6'] : ['表', '裏'];
      const colors = [C1, C2, C3, C4, '#7dffa8', '#ff9a6b'];
      const bars = counts.map((c, i) => ({ v: c, label: labels[i], color: colors[i], top: (c / T * 100).toFixed(1) + '%' }));
      const el = this.$('[data-chart="trial"]');
      el.innerHTML = barChart(bars) +
        (run.length > 1 ? lineChart([{ pts: run, color: C1, name: `「${labels[0]}」の割合 %` }], { legend: true, hline: expect, y0: 0, y1: Math.max(100 / faces * 2, ...run.map((r) => r[1])), xUnit: '回' }) : '');
      this.$('[data-slot="trial"]').innerHTML = counts.map((c, i) => chip(labels[i], c, '回')).join('');
      if (this.cb.rendered) this.cb.rendered(this.root);
    }

    drawBirthday() {
      const el = this.$('[data-chart="bday"]');
      if (!el) return;
      const v = this.value;
      const max = Math.max(60, Math.min(v, 100));
      const pts = [];
      for (let k = 1; k <= max; k++) pts.push([k, L().birthday(k) * 100]);
      el.innerHTML = lineChart([{ pts, color: C3, fill: true }], { y0: 0, y1: 100, hline: 50, marker: [Math.min(v, max), L().birthday(Math.min(v, max)) * 100], xUnit: '人' });
    }

    drawCollatz() {
      const el = this.$('[data-chart="collatz"]');
      if (!el) return;
      const seq = L().collatz(this.value);
      const max = Math.max(...seq);
      const pts = seq.map((y, i) => [i, y]);
      el.innerHTML = lineChart([{ pts, color: C4, width: 1.6 }], { logY: max / Math.max(1, Math.min(...seq)) > 1000, y0: 1, xUnit: '歩' });
    }

    drawDots() {
      const cv = this.$('[data-viz="dots"]');
      if (!cv) return;
      const v = Math.abs(this.value);
      let unit = 1;
      if (v > 1000 || (v < 1 && v > 0)) unit = Math.pow(10, Math.floor(Math.log10(v)) - 2);
      const count = v === 0 ? 0 : v / unit;
      const full = Math.floor(count + 1e-9);
      const part = count - full;
      const W = 340;
      const cell = count <= 100 ? 10 : count <= 400 ? 7 : 5;
      const gap = cell + 2;
      const blockCols = Math.max(1, Math.floor((W + gap) / (cell * 10 + gap)));
      const bs = cell * 10;
      const blocks = Math.ceil((full + (part > 0.001 ? 1 : 0)) / 100) || 1;
      const rows = Math.ceil(blocks / blockCols);
      const H = rows * (bs + gap) + 4;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = W + 'px'; cv.style.aspectRatio = `${W} / ${H}`;
      const ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      const hue = MS.blobHue(this.value);
      const total = full + (part > 0.001 ? 1 : 0);
      for (let i = 0; i < total; i++) {
        const b = Math.floor(i / 100), k = i % 100;
        const bx = (b % blockCols) * (bs + gap) + 2, by = Math.floor(b / blockCols) * (bs + gap) + 2;
        const x = bx + (k % 10) * cell + cell / 2, y = by + Math.floor(k / 10) * cell + cell / 2;
        const isPart = i === full;
        ctx.fillStyle = `hsla(${hue + (b * 9) % 60},100%,${isPart ? 55 : 70}%,${isPart ? 0.5 : 0.95})`;
        ctx.beginPath(); ctx.arc(x, y, (cell * 0.38) * (isPart ? Math.sqrt(part) : 1), 0, Math.PI * 2); ctx.fill();
      }
      const note = this.$('[data-slot="dots"]');
      note.textContent = unit === 1
        ? `● 1 個 = 1。${MS.fmt(v)} 個の点 (10×10 のマス = 100)。`
        : `● 1 個 = ${MS.fmt(unit)}。点 ${Math.round(count)} 個ぶん。`;
    }

    drawScale() {
      const el = this.$('[data-chart="scale"]');
      if (!el) return;
      const v = Math.abs(this.value);
      const e = Math.log10(v);
      const lo = Math.floor(e) - 3, hi = Math.floor(e) + 4;
      const W = 340, H = 132, P = 16;
      const X = (x) => P + (Math.log10(x) - lo) / (hi - lo) * (W - 2 * P);
      const lms = L().LANDMARKS.filter(([x]) => Math.log10(x) >= lo && Math.log10(x) <= hi);
      let g = `<svg viewBox="0 0 ${W} ${H}" class="svg-chart" role="img"><line x1="${P}" x2="${W - P}" y1="70" y2="70" class="axis"/>`;
      for (let k = lo; k <= hi; k++) {
        g += `<line x1="${X(Math.pow(10, k))}" x2="${X(Math.pow(10, k))}" y1="66" y2="74" class="axis"/>` +
          `<text x="${X(Math.pow(10, k))}" y="126" class="ax" text-anchor="middle">${esc(MS.short(Math.pow(10, k)))}</text>`;
      }
      // ラベルが重ならないよう、上下の段に余白があるものだけ文字を出す
      const lastX = [-1e9, -1e9];
      let row = 0;
      lms.forEach(([x, name]) => {
        const px = X(x);
        const short = name.length > 8 ? name.slice(0, 8) + '…' : name;
        const need = short.length * 9.5 + 6;
        let slot = -1;
        for (let k = 0; k < 2; k++) { const r = (row + k) % 2; if (px - lastX[r] > need) { slot = r; break; } }
        g += `<circle cx="${px}" cy="70" r="3" fill="${C2}"/>`;
        if (slot >= 0 && Math.abs(px - X(v)) > 14) {
          const up = slot === 0;
          lastX[slot] = px;
          row = slot + 1;
          const tx = Math.max(P + need / 2 - 6, Math.min(W - P - need / 2 + 6, px));
          g += `<line x1="${px}" x2="${px}" y1="70" y2="${up ? 46 : 96}" stroke="${C2}" stroke-width="0.6" opacity="0.6"/>` +
            `<text x="${tx}" y="${up ? 42 : 108}" class="ax lm" text-anchor="middle">${esc(short)}</text>`;
        }
      });
      g += `<circle cx="${X(v)}" cy="70" r="7" class="marker"/><text x="${X(v)}" y="18" class="ax me" text-anchor="middle">${esc(MS.short(v))}</text>`;
      el.innerHTML = g + '</svg>';

      // 近いデータとの比較
      const all = L().LANDMARKS;
      let below = null, above = null;
      for (const lm of all) { if (lm[0] <= v) below = lm; else { above = lm; break; } }
      const rows = [];
      for (const lm of [below, above]) {
        if (!lm) continue;
        const r = v / lm[0];
        const p4 = (x) => MS.fmt(parseFloat(x.toPrecision(4)));
        const txt = Math.abs(r - 1) < 1e-9 ? 'とちょうど同じ' : r >= 1 ? `の ${p4(r)} 倍` : `の ${p4(r)} 倍 (約 1/${p4(1 / r)})`;
        rows.push(`<div class="row"><span class="rk">${esc(lm[1])}</span><span class="eq small">${esc(MS.fmt(lm[0]))} ${esc(txt)}</span></div>`);
      }
      this.$('[data-slot="scale"]').innerHTML = rows.join('') + chips([below, above].filter(Boolean).map((lm) => chip(lm[1], lm[0])));
      if (this.cb.rendered) this.cb.rendered(this.root);
    }

    drawRects() {
      const el = this.$('[data-chart="rects"]');
      if (!el) return;
      const n = Math.abs(this.value);
      const ds = L().divisors(n);
      let pairs = [];
      for (const d of ds) { if (d * d > n) break; pairs.push([d, n / d]); }
      if (pairs.length > 6) pairs = pairs.filter((_, i) => i === 0 || i === pairs.length - 1 || i % Math.ceil(pairs.length / 5) === 0).slice(0, 6);
      const W = 340, H = 200, P = 12;
      // すべて同じ面積 S に正規化。最大の縦横を収める
      let maxW = 0, maxH = 0;
      for (const [a, b] of pairs) { maxW = Math.max(maxW, b / Math.sqrt(n)); maxH = Math.max(maxH, a / Math.sqrt(n)); }
      const s = Math.min((W - 2 * P) / maxW, (H - 2 * P - 14) / Math.max(maxH, 1));
      const colors = [C1, C2, C3, C4, '#7dffa8', '#ff9a6b'];
      let g = `<svg viewBox="0 0 ${W} ${H}" class="svg-chart" role="img">`;
      pairs.forEach(([a, b], i) => {
        const w = b / Math.sqrt(n) * s, h = a / Math.sqrt(n) * s;
        g += `<rect x="${P}" y="${H - P - h}" width="${w}" height="${h}" fill="${colors[i % 6]}" fill-opacity="0.08" stroke="${colors[i % 6]}" stroke-width="1.6"/>` +
          `<text x="${P + Math.min(w, W - 2 * P) - 4}" y="${H - P - h - 4}" class="ax" text-anchor="end" fill="${colors[i % 6]}">${esc(fmt(a))}×${esc(fmt(b))}</text>`;
      });
      el.innerHTML = g + '</svg>';
    }

    drawBits() {
      const el = this.$('[data-viz="bits"]');
      if (!el) return;
      const bits = Math.abs(this.value).toString(2);
      const n = Math.max(8, Math.ceil(bits.length / 8) * 8);
      const padded = bits.padStart(n, '0');
      el.innerHTML = [...padded].map((b, i) => `<span class="${b === '1' ? 'on' : ''}" title="2^${n - 1 - i}">${b}</span>`).join('');
    }

    drawRainbow() {
      const el = this.$('[data-chart="rainbow"]');
      if (!el) return;
      const digits = String(MS.clean(Math.abs(this.value))).replace(/[^0-9]/g, '').slice(0, 24).split('').map(Number);
      const bars = digits.map((d) => ({ v: d + 0.15, label: String(d), color: `hsl(${200 + d * 18},100%,65%)` }));
      el.innerHTML = barChart(bars, { h: 120 });
    }

    drawPie() {
      const el = this.$('[data-chart="pie"]');
      if (!el) return;
      const f = Math.abs(this.value) - Math.floor(Math.abs(this.value));
      const R = 54, cx = 170, cy = 66;
      const a = f * Math.PI * 2;
      const x = cx + R * Math.sin(a), y = cy - R * Math.cos(a);
      const large = f > 0.5 ? 1 : 0;
      el.innerHTML = `<svg viewBox="0 0 340 140" class="svg-chart" role="img"><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="14"/>` +
        `<path d="M${cx},${cy - R} A${R},${R} 0 ${large} 1 ${x},${y}" fill="none" stroke="${C1}" stroke-width="14" stroke-linecap="round"/>` +
        `<text x="${cx}" y="${cy + 6}" class="ax me" text-anchor="middle">${(f * 100).toFixed(1)}%</text>` +
        `<text x="${cx}" y="134" class="ax" text-anchor="middle">一周 = 1 としたときの小数部 ${esc(MS.fmt(MS.clean(f)))}</text></svg>`;
    }
  }

  MS.Inspector = Inspector;
})(window.MS);
