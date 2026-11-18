/* Mathspace — 2ⁿ DROP: 上から落ちてくる 2 の累乗を、同じ数どうしでくっつけていくゲーム */
window.MS = window.MS || {};
(function (MS) {
  'use strict';

  const TAU = Math.PI * 2;
  const log2 = (v) => Math.round(Math.log2(v));
  // 落ちてくる数 (小さいほど出やすい)
  const DROPS = [[2, 34], [4, 28], [8, 20], [16, 12], [32, 6]];

  function pickDrop() {
    const total = DROPS.reduce((s, d) => s + d[1], 0);
    let r = Math.random() * total;
    for (const [v, w] of DROPS) { if ((r -= w) < 0) return v; }
    return 2;
  }
  const hueOf = (v) => (200 + log2(v) * 34) % 360;

  class Game {
    constructor(root, opts) {
      this.root = root;
      this.opts = opts || {};
      this.canvas = root.querySelector('#gameCanvas');
      this.world = new MS.World(this.canvas);
      this.world.paused = true;
      this.world.maxBlobs = 120;
      this.world.autoMerge = true;
      this.world.radiusFn = (v) => this.radius(v);
      this.world.hueFn = hueOf;
      this.world.onAutoMerge = (v) => this.onMerge(v);
      this.world.onFrame = () => this.frame();
      this.scoreEl = root.querySelector('#gScore');
      this.bestEl = root.querySelector('#gBest');
      this.nextEl = root.querySelector('#gNext');
      this.overEl = root.querySelector('#gOver');
      try { this.best = +localStorage.getItem('mathscape-drop-best') || 0; } catch (e) { this.best = 0; }
      this.bindInput();
      root.querySelector('#gClose').addEventListener('click', () => this.close());
      root.querySelector('#gRetry').addEventListener('click', () => this.reset());
      root.querySelector('#gRestart').addEventListener('click', () => this.reset());
      window.addEventListener('resize', () => { if (this.open) this.world.resize(); });
    }

    radius(v) {
      const w = this.world.w;
      return Math.max(14, w * (0.038 + 0.021 * log2(v)));
    }

    show() {
      this.root.hidden = false;
      this.open = true;
      requestAnimationFrame(() => {
        this.world.resize();
        this.world.paused = false;
        if (!this.started) this.reset();
      });
    }

    close() {
      this.open = false;
      this.world.paused = true;
      this.root.hidden = true;
      if (this.opts.onClose) this.opts.onClose();
    }

    reset() {
      this.started = true;
      this.world.blobs = [];
      this.score = 0;
      this.maxV = 2;
      this.over = false;
      this.danger = 0;
      this.cooldown = 0;
      this.cur = pickDrop();
      this.next = pickDrop();
      this.x = this.world.w / 2;
      this.overEl.hidden = true;
      this.updateHud();
    }

    updateHud() {
      this.scoreEl.textContent = this.score.toLocaleString('en-US');
      this.bestEl.textContent = this.best.toLocaleString('en-US');
      this.nextEl.textContent = this.next;
      this.nextEl.style.setProperty('--h', hueOf(this.next));
    }

    onMerge(v) {
      this.score += v;
      if (v > this.maxV) {
        this.maxV = v;
        if (v >= 256 && this.opts.toast) this.opts.toast(`${v.toLocaleString('en-US')} ができた! (2^${log2(v)})`);
      }
      if (this.score > this.best) {
        this.best = this.score;
        try { localStorage.setItem('mathscape-drop-best', String(this.best)); } catch (e) { /* noop */ }
      }
      this.updateHud();
    }

    get dropY() { return this.radius(this.cur) + 8; }
    get dangerY() { return this.radius(32) * 2 + 22; }

    bindInput() {
      const c = this.canvas;
      const local = (e) => e.clientX - c.getBoundingClientRect().left;
      let down = false;
      c.addEventListener('pointerdown', (e) => {
        if (this.over) return;
        down = true;
        c.setPointerCapture(e.pointerId);
        this.x = local(e);
      });
      c.addEventListener('pointermove', (e) => {
        if (this.over) return;
        if (down || e.pointerType === 'mouse') this.x = local(e);
      });
      c.addEventListener('pointerup', (e) => {
        if (!down) return;
        down = false;
        this.x = local(e);
        this.drop();
      });
      c.addEventListener('pointercancel', () => { down = false; });
      this.root.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { this.x -= 24; e.preventDefault(); }
        if (e.key === 'ArrowRight') { this.x += 24; e.preventDefault(); }
        if (e.key === ' ' || e.key === 'Enter') { this.drop(); e.preventDefault(); }
        if (e.key === 'Escape') this.close();
      });
    }

    clampX(v) {
      const r = this.radius(v);
      return Math.max(r + 3, Math.min(this.world.w - r - 3, this.x));
    }

    drop() {
      if (this.over || this.cooldown > 0) return;
      const v = this.cur;
      const b = this.world.add(this.clampX(v), this.dropY, v, { scale: 1, vy: 2 });
      if (b) b.dropped = performance.now();
      this.cur = this.next;
      this.next = pickDrop();
      this.cooldown = 28; // 約 0.45 秒
      this.updateHud();
    }

    /** 毎フレーム: ゲームオーバー判定と、上の「持っている数」・ガイドの描画 */
    frame() {
      if (!this.open) return;
      const w = this.world, g = w.ctx;
      if (this.cooldown > 0) this.cooldown--;
      const now = performance.now();
      const dy = this.dangerY;

      // 線より上に積み上がったまま 2.5 秒たったら終わり
      let high = false;
      for (const b of w.blobs) {
        if (b.dying || !b.dropped && b.scale < 0.9) continue;
        if (b.dropped && now - b.dropped < 1200) continue;
        if (b.cy - b.R < dy) { high = true; break; }
      }
      this.danger = high ? this.danger + 1 / 60 : Math.max(0, this.danger - 2 / 60);
      if (!this.over && this.danger > 2.5) this.gameOver();

      g.save();
      // 危険ライン
      const warn = Math.min(1, this.danger / 2.5);
      g.strokeStyle = warn > 0 ? `rgba(255,${120 - warn * 80},${170 - warn * 120},${0.5 + 0.5 * Math.abs(Math.sin(now / 120)) * warn})` : 'rgba(255,107,214,0.35)';
      g.setLineDash([6, 8]);
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, dy); g.lineTo(w.w, dy); g.stroke();
      g.setLineDash([]);

      if (!this.over) {
        const v = this.cur, r = this.radius(v), x = this.clampX(v), y = this.dropY;
        // 落ちる先のガイド
        const lg = g.createLinearGradient(0, y, 0, w.h);
        lg.addColorStop(0, `hsla(${hueOf(v)},100%,70%,0.35)`);
        lg.addColorStop(1, `hsla(${hueOf(v)},100%,70%,0)`);
        g.fillStyle = lg;
        g.fillRect(x - 1, y + r, 2, w.h - y - r);
        // 持っている数
        const ready = this.cooldown <= 0;
        g.globalAlpha = ready ? 1 : 0.45;
        const h = hueOf(v);
        const rg = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.15);
        rg.addColorStop(0, `hsla(${h},100%,92%,0.98)`);
        rg.addColorStop(0.35, `hsla(${h},95%,68%,0.9)`);
        rg.addColorStop(1, `hsla(${h + 28},85%,34%,0.92)`);
        g.shadowColor = `hsla(${h},100%,62%,0.75)`;
        g.shadowBlur = 20;
        g.fillStyle = rg;
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(255,255,255,0.3)';
        g.beginPath(); g.ellipse(x - r * 0.33, y - r * 0.48, r * 0.3, r * 0.15, -0.55, 0, TAU); g.fill();
        g.fillStyle = '#fff';
        g.font = `700 ${Math.min(r * 0.62, (r * 1.6) / Math.max(1, String(v).length * 0.58))}px "Avenir Next", "Hiragino Sans", system-ui, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(v), x, y);
      }
      g.restore();
    }

    gameOver() {
      this.over = true;
      this.overEl.hidden = false;
      this.overEl.querySelector('#gFinal').textContent = this.score.toLocaleString('en-US');
      this.overEl.querySelector('#gMax').textContent = `${this.maxV.toLocaleString('en-US')} (2^${log2(this.maxV)})`;
      this.overEl.querySelector('#gFinalBest').textContent = this.best.toLocaleString('en-US');
    }
  }

  MS.Game = Game;
})(window.MS);
