/* Mathspace — ぷにぷに数字 (ソフトボディ物理) */
window.MS = window.MS || {};
(function (MS) {
  'use strict';

  const N = 20;                 // 輪郭の点の数
  const TAU = Math.PI * 2;
  const COS = [], SIN = [];
  for (let i = 0; i < N; i++) { COS.push(Math.cos(i / N * TAU)); SIN.push(Math.sin(i / N * TAU)); }
  const POLY_K = (N / 2) * Math.sin(TAU / N); // 正N角形の面積係数 (×R²)

  let seq = 0;

  function hueFor(v) {
    if (!MS.isValid(v)) return 0;
    if (v < 0) return 22;
    if (v === 0) return 220;
    if (!Number.isInteger(v)) return 158;
    if (MS.isPrime && MS.isPrime(v)) return 188;
    return v % 2 === 0 ? 262 : 312;
  }

  function radiusFor(v) {
    const a = Math.abs(v);
    const l = Math.log10(a + 1);
    return Math.max(38, Math.min(94, 38 + l * 11));
  }

  class Blob {
    constructor(x, y, value, opt = {}) {
      this.id = ++seq;
      this.value = MS.clean(value);
      this.label = MS.short(this.value);
      this.r = opt.r || radiusFor(this.value) * (opt.k || 1);
      this.hue = opt.hue != null ? opt.hue : hueFor(this.value);
      this.scale = opt.scale != null ? opt.scale : 0.25;
      this.sv = 0;               // スケールの速度 (ぷるんとさせる)
      this.targetScale = 1;
      this.dying = null;
      this.pts = [];
      const r0 = this.r * this.scale;
      const vx = opt.vx || 0, vy = opt.vy || 0;
      for (let i = 0; i < N; i++) {
        const px = x + COS[i] * r0, py = y + SIN[i] * r0;
        this.pts.push({ x: px, y: py, ox: px - vx, oy: py - vy });
      }
      this.cx = x; this.cy = y; this.angle = 0;
      this.R = r0;
      this.born = performance.now();
    }

    get radius() { return this.r * this.scale; }

    /** つつかれたときの ぷるん */
    poke(amount = 0.18) { this.sv -= amount; }

    contains(x, y, pad = 1.08) {
      const dx = x - this.cx, dy = y - this.cy;
      return dx * dx + dy * dy <= (this.R * pad) * (this.R * pad);
    }
  }

  class World {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.blobs = [];
      this.gravity = true;
      this.grab = null;
      this.highlight = null;  // ドロップ先として光らせるぷに
      this.particles = [];
      this.w = 0; this.h = 0;
      this.time = 0;
      this.resize();
      for (let i = 0; i < 70; i++) this.particles.push(this.newParticle(true));
      window.addEventListener('resize', () => this.resize());
      this._last = performance.now();
      this._acc = 0;
      this.paused = false;
      this.maxBlobs = 40;
      this.radiusFn = null;   // ゲームなどで大きさ・色を決める関数
      this.hueFn = null;
      this.autoMerge = false; // 同じ数どうしが触れたら合体 (ゲーム用)
      const loop = (t) => {
        if (this.paused) { this._last = t; requestAnimationFrame(loop); return; }
        const dt = Math.min(0.05, (t - this._last) / 1000);
        this._last = t;
        this._acc += dt;
        let steps = 0;
        while (this._acc >= 1 / 60 && steps < 4) { this.step(1 / 60); this._acc -= 1 / 60; steps++; }
        if (steps === 4) this._acc = 0;
        this.draw();
        if (this.onFrame) this.onFrame();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      const ow = this.w, oh = this.h;
      this.w = Math.max(10, r.width); this.h = Math.max(10, r.height);
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      // 画面サイズが縮んだらぷにを内側へ
      if (ow && oh) {
        for (const b of this.blobs) {
          const dx = Math.min(0, this.w - b.R - b.cx) + Math.max(0, b.R - b.cx);
          const dy = Math.min(0, this.h - b.R - b.cy) + Math.max(0, b.R - b.cy);
          if (dx || dy) for (const p of b.pts) { p.x += dx; p.y += dy; p.ox += dx; p.oy += dy; }
        }
      }
    }

    newParticle(anyY) {
      return {
        x: Math.random() * this.w,
        y: anyY ? Math.random() * this.h : this.h + 10,
        v: 6 + Math.random() * 22,
        r: Math.random() * 1.6 + 0.3,
        hue: Math.random() < 0.5 ? 280 : 190,
        a: Math.random() * 0.5 + 0.15,
      };
    }

    add(x, y, value, opt) {
      const v = MS.clean(value);
      if (!MS.isValid(v)) return null;
      opt = Object.assign({}, opt);
      if (this.radiusFn && !opt.r) opt.r = this.radiusFn(v);
      if (this.hueFn && opt.hue == null) opt.hue = this.hueFn(v);
      const m = opt.r ? opt.r + 3 : 40;
      x = Math.max(m, Math.min(this.w - m, x));
      y = Math.max(opt.r ? -opt.r : 40, Math.min(this.h - m, y));
      // 小さな画面ではぷにも小さめに
      const k = Math.max(0.62, Math.min(1, Math.min(this.w, this.h * 1.4) / 760));
      const b = new Blob(x, y, v, Object.assign({ k }, opt));
      this.blobs.push(b);
      while (this.blobs.filter(o => !o.dying).length > this.maxBlobs) {
        const old = this.blobs.find(o => !o.dying && o !== b && (!this.grab || this.grab.blob !== o));
        if (!old) break;
        this.remove(old);
      }
      return b;
    }

    remove(b) {
      b.dying = { tx: b.cx, ty: b.cy - 10, kind: 'pop' };
    }

    clear() { for (const b of this.blobs) this.remove(b); }

    /** 二つのぷにを合体させ、新しいぷにを生む */
    merge(a, b, value) {
      const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
      a.dying = { tx: mx, ty: my, kind: 'merge' };
      b.dying = { tx: mx, ty: my, kind: 'merge' };
      if (this.grab && (this.grab.blob === a || this.grab.blob === b)) this.grab = null;
      setTimeout(() => {
        const nb = this.add(mx, my, value, { scale: 0.15, vy: -4 });
        if (nb) { nb.sv = 0.12; this.burst(mx, my, nb.hue); }
      }, 260);
    }

    burst(x, y, hue) {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * TAU, s = 60 + Math.random() * 220;
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, r: Math.random() * 2 + 1, hue, a: 1, spark: true });
      }
    }

    /** 同じ数のぷにが触れていたら合体させる (ゲーム用) */
    checkMerges() {
      const bl = this.blobs;
      for (let i = 0; i < bl.length; i++) {
        const A = bl[i];
        if (A.dying || A.scale < 0.85) continue;
        for (let j = i + 1; j < bl.length; j++) {
          const B = bl[j];
          if (B.dying || B.scale < 0.85 || B.value !== A.value) continue;
          const d = Math.hypot(A.cx - B.cx, A.cy - B.cy);
          if (d < (A.R + B.R) * 1.04) {
            const v = A.value * 2;
            // 下にある方の位置で生まれる
            const lower = A.cy > B.cy ? A : B;
            this.mergeAt(A, B, v, lower.cx * 0.7 + (A.cx + B.cx) / 2 * 0.3, lower.cy * 0.7 + (A.cy + B.cy) / 2 * 0.3);
            if (this.onAutoMerge) this.onAutoMerge(v, (A.cx + B.cx) / 2, (A.cy + B.cy) / 2);
            return;
          }
        }
      }
    }

    mergeAt(a, b, value, mx, my) {
      a.dying = { tx: mx, ty: my, kind: 'merge' };
      b.dying = { tx: mx, ty: my, kind: 'merge' };
      setTimeout(() => {
        const nb = this.add(mx, my, value, { scale: 0.35, vy: -3 });
        if (nb) { nb.sv = 0.1; this.burst(mx, my, nb.hue); }
      }, 140);
    }

    blobAt(x, y) {
      for (let i = this.blobs.length - 1; i >= 0; i--) {
        const b = this.blobs[i];
        if (!b.dying && b.contains(x, y)) return b;
      }
      return null;
    }

    /** つかんでいるぷにと重なっているぷに */
    overlapping(b) {
      let best = null, bd = Infinity;
      for (const o of this.blobs) {
        if (o === b || o.dying) continue;
        const d = Math.hypot(o.cx - b.cx, o.cy - b.cy);
        if (d < (o.R + b.R) * 0.92 && d < bd) { bd = d; best = o; }
      }
      return best;
    }

    startGrab(b, x, y) {
      // 前面へ
      this.blobs.splice(this.blobs.indexOf(b), 1);
      this.blobs.push(b);
      this.grab = { blob: b, x, y, offX: x - b.cx, offY: y - b.cy };
      b.poke(0.08);
    }
    moveGrab(x, y) { if (this.grab) { this.grab.x = x; this.grab.y = y; } }
    endGrab() { this.grab = null; }

    step(dt) {
      this.time += dt;
      const SUB = 2;
      const g = this.gravity ? 1500 : 0;
      const h = dt / SUB;
      const floor = this.h - 4;

      for (let s = 0; s < SUB; s++) {
        // --- スケール (ぷるん) & 積分 ---
        for (const b of this.blobs) {
          if (b.dying) {
            b.scale *= b.dying.kind === 'merge' ? 0.9 : 0.86;
          } else {
            const breathe = b.targetScale + Math.sin(this.time * 2.2 + b.id * 1.3) * 0.018;
            b.sv += (breathe - b.scale) * 0.06;
            b.sv *= 0.86;
            b.scale = Math.max(0.1, b.scale + b.sv);
          }
          const damp = this.gravity ? 0.993 : 0.985;
          for (const p of b.pts) {
            const vx = (p.x - p.ox) * damp, vy = (p.y - p.oy) * damp;
            p.ox = p.x; p.oy = p.y;
            p.x += vx; p.y += vy + g * h * h;
          }
          if (!this.gravity && !b.dying) {
            // 無重力: ふわふわ漂う
            const fx = Math.sin(this.time * 0.6 + b.id) * 0.004, fy = Math.cos(this.time * 0.5 + b.id * 1.7) * 0.004;
            for (const p of b.pts) { p.x += fx; p.y += fy; }
          }
        }

        for (let it = 0; it < 3; it++) {
          for (const b of this.blobs) this.solveBlob(b);
          this.solveGrab();
          this.solveCollisions();
          this.solveWalls(floor);
        }
      }
      this.blobs = this.blobs.filter(b => !(b.dying && b.scale < 0.12));
      if (this.autoMerge) this.checkMerges();

      // 背景の粒子
      for (const p of this.particles) {
        if (p.spark) {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; p.life -= dt * 1.6;
        } else {
          p.y -= p.v * dt;
          if (p.y < -10) Object.assign(p, this.newParticle(false));
        }
      }
      this.particles = this.particles.filter(p => !p.spark || p.life > 0);
    }

    solveBlob(b) {
      const pts = b.pts;
      const R = b.r * b.scale;
      let cx = 0, cy = 0;
      for (const p of pts) { cx += p.x; cy += p.y; }
      cx /= N; cy /= N;

      // 最適回転角 (シェイプマッチング)
      let sc = 0, ss = 0;
      for (let i = 0; i < N; i++) {
        const dx = pts[i].x - cx, dy = pts[i].y - cy;
        sc += COS[i] * dx + SIN[i] * dy;
        ss += COS[i] * dy - SIN[i] * dx;
      }
      const th = Math.atan2(ss, sc);
      const ct = Math.cos(th), st = Math.sin(th);
      const grabbed = this.grab && this.grab.blob === b;
      const k = b.dying ? 0.3 : grabbed ? 0.018 : 0.028;
      for (let i = 0; i < N; i++) {
        const rx = COS[i] * ct - SIN[i] * st, ry = COS[i] * st + SIN[i] * ct;
        const p = pts[i];
        p.x += (cx + rx * R - p.x) * k;
        p.y += (cy + ry * R - p.y) * k;
      }

      // 隣同士のバネ
      const L = 2 * R * Math.sin(Math.PI / N);
      for (let i = 0; i < N; i++) {
        const a = pts[i], c = pts[(i + 1) % N];
        const dx = c.x - a.x, dy = c.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const f = (d - L) / d * 0.25;
        a.x += dx * f; a.y += dy * f;
        c.x -= dx * f; c.y -= dy * f;
      }

      // 内圧 (体積を保つ)
      let area = 0, per = 0;
      for (let i = 0; i < N; i++) {
        const a = pts[i], c = pts[(i + 1) % N];
        area += a.x * c.y - c.x * a.y;
        per += Math.hypot(c.x - a.x, c.y - a.y);
      }
      area *= 0.5;
      const rest = POLY_K * R * R;
      const amt = (rest - area) / (per || 1) * 0.6;
      for (let i = 0; i < N; i++) {
        const prev = pts[(i + N - 1) % N], next = pts[(i + 1) % N];
        let nx = next.y - prev.y, ny = -(next.x - prev.x);
        const nl = Math.hypot(nx, ny) || 1;
        pts[i].x += nx / nl * amt;
        pts[i].y += ny / nl * amt;
      }

      if (b.dying) {
        for (const p of pts) {
          p.x += (b.dying.tx - p.x) * 0.06;
          p.y += (b.dying.ty - p.y) * 0.06;
        }
      }

      b.cx = cx; b.cy = cy; b.angle = th; b.R = R;
    }

    solveGrab() {
      const g = this.grab;
      if (!g || g.blob.dying) return;
      const b = g.blob;
      const ax = b.cx + g.offX, ay = b.cy + g.offY;
      const dx = g.x - ax, dy = g.y - ay;
      const R = b.R;
      for (const p of b.pts) {
        const d = Math.hypot(p.x - ax, p.y - ay);
        const w = 0.05 + 0.2 * Math.max(0, 1 - d / (2 * R));
        p.x += dx * w;
        p.y += dy * w;
      }
    }

    solveCollisions() {
      const bl = this.blobs;
      for (let i = 0; i < bl.length; i++) {
        const A = bl[i];
        if (A.dying) continue;
        for (let j = i + 1; j < bl.length; j++) {
          const B = bl[j];
          if (B.dying) continue;
          const dcx = B.cx - A.cx, dcy = B.cy - A.cy;
          const lim = (A.R + B.R) * 1.05;
          if (dcx * dcx + dcy * dcy > lim * lim) continue;
          // つかんでいるぷには相手にめり込める (合体の操作のため)
          const g = this.grab && (this.grab.blob === A || this.grab.blob === B);
          this.pushOut(A, B, g ? 0.5 : 0.96);
          this.pushOut(B, A, g ? 0.5 : 0.96);
        }
      }
    }

    /** A の点を B の円の外へ押し出す */
    pushOut(A, B, k) {
      const rr = B.R * k;
      let mx = 0, my = 0;
      for (const p of A.pts) {
        const dx = p.x - B.cx, dy = p.y - B.cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4;
        const pen = rr - d;
        const nx = dx / d, ny = dy / d;
        p.x += nx * pen * 0.5; p.y += ny * pen * 0.5;
        mx += nx * pen * 0.5; my += ny * pen * 0.5;
      }
      if (mx || my) {
        mx /= N; my /= N;
        for (const q of B.pts) { q.x -= mx; q.y -= my; }
      }
    }

    solveWalls(floor) {
      const w = this.w;
      for (const b of this.blobs) {
        for (const p of b.pts) {
          if (p.y > floor) { p.y = floor; p.ox = p.x - (p.x - p.ox) * 0.7; }
          if (p.y < 2) { p.y = 2; p.ox = p.x - (p.x - p.ox) * 0.7; }
          if (p.x < 2) { p.x = 2; p.oy = p.y - (p.y - p.oy) * 0.7; }
          if (p.x > w - 2) { p.x = w - 2; p.oy = p.y - (p.y - p.oy) * 0.7; }
        }
      }
    }

    /* ---------- 描画 ---------- */
    draw() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);

      // 粒子
      for (const p of this.particles) {
        const a = p.spark ? Math.max(0, p.life) : p.a;
        ctx.fillStyle = `hsla(${p.hue},100%,75%,${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }

      // 床の光
      const fy = this.h - 3;
      const lg = ctx.createLinearGradient(0, 0, this.w, 0);
      lg.addColorStop(0, 'rgba(120,90,255,0)');
      lg.addColorStop(0.5, 'rgba(160,140,255,0.55)');
      lg.addColorStop(1, 'rgba(80,230,255,0)');
      ctx.strokeStyle = lg; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(this.w, fy); ctx.stroke();

      // 影
      for (const b of this.blobs) {
        const dist = fy - (b.cy + b.R);
        if (dist > 260) continue;
        const a = 0.28 * (1 - Math.max(0, dist) / 260) * Math.min(1, b.scale);
        ctx.fillStyle = `hsla(${b.hue},100%,60%,${a})`;
        ctx.beginPath();
        ctx.ellipse(b.cx, fy, b.R * (1 + Math.max(0, dist) / 400), 5, 0, 0, TAU);
        ctx.fill();
      }

      // 結合線 (つかんでいるぷに と ドロップ先)
      if (this.grab && this.highlight) {
        const a = this.grab.blob, b = this.highlight;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.setLineDash([4, 6]);
        ctx.lineDashOffset = -this.time * 40;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(b.cx, b.cy, b.R + 10, 0, TAU); ctx.stroke();
        ctx.restore();
      }

      for (const b of this.blobs) this.drawBlob(b);
    }

    drawBlob(b) {
      const ctx = this.ctx;
      const pts = b.pts;
      const R = b.R;
      const { cx, cy, hue } = b;
      if (R < 2) return;

      ctx.save();
      ctx.beginPath();
      const last = pts[N - 1], first = pts[0];
      ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
      for (let i = 0; i < N; i++) {
        const p = pts[i], q = pts[(i + 1) % N];
        ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
      }
      ctx.closePath();

      const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.42, R * 0.05, cx, cy, R * 1.15);
      g.addColorStop(0, `hsla(${hue},100%,92%,0.98)`);
      g.addColorStop(0.35, `hsla(${hue},95%,68%,0.9)`);
      g.addColorStop(1, `hsla(${hue + 28},85%,34%,0.92)`);
      ctx.shadowColor = `hsla(${hue},100%,62%,0.75)`;
      ctx.shadowBlur = this.grab && this.grab.blob === b ? 34 : 22;
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = `hsla(${hue},100%,88%,0.75)`;
      ctx.stroke();

      // つや
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.beginPath();
      ctx.ellipse(cx - R * 0.33, cy - R * 0.48, R * 0.3, R * 0.15, -0.55, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(cx + R * 0.42, cy - R * 0.3, R * 0.06, 0, TAU);
      ctx.fill();
      ctx.restore();

      // 形の伸び縮みに合わせて文字もつぶれる
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      for (const p of pts) {
        if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
        if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
      }
      const sx = Math.max(0.6, Math.min(1.5, (maxx - minx) / (2 * R)));
      const sy = Math.max(0.6, Math.min(1.5, (maxy - miny) / (2 * R)));
      const label = b.label;
      const fs = Math.min(R * 0.62, (R * 1.6) / Math.max(1, label.length * 0.58));
      ctx.save();
      ctx.translate((minx + maxx) / 2, (miny + maxy) / 2);
      ctx.scale(sx, sy);
      ctx.font = `700 ${fs}px "Avenir Next", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(20,8,60,0.35)';
      ctx.fillText(label, 0, 2);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }

  MS.Blob = Blob;
  MS.World = World;
  MS.blobHue = hueFor;
})(window.MS);
