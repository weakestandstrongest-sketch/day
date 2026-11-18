/* Mathspace — 起動アニメーション (ホログラムの台座が組み上がる演出を 3 種類) */
window.MS = window.MS || {};
(function (MS) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const span = (t, a, b) => clamp01((t - a) / (b - a));           // a〜b 秒の進み具合
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeBack = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2));
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  const KINDS = {
    /* 1. 起動: 台座が下から 1 段ずつせり上がり、枠が灯り、網が走り、光が昇る */
    boot: {
      name: '起動', dur: 3.7, logoAt: 2.7,
      fx(t) {
        return {
          stars: span(t, 0, 0.6),
          slabs: [easeBack(span(t, 0.25, 0.85)), easeBack(span(t, 0.55, 1.1)), easeBack(span(t, 0.8, 1.3))],
          frame: span(t, 1.25, 1.4) * (1 + 1.6 * Math.max(0, 1 - Math.abs(t - 1.42) * 5)),
          mesh: easeOut(span(t, 1.35, 2.1)),
          fiber: easeOut(span(t, 1.8, 2.6)) * 1.1,
          panels: easeOut(span(t, 2.4, 3.0)),
          spin: 0.9 * (1 - easeInOut(span(t, 0, 2.8))),
        };
      },
      zoom: (t) => 1.35 - 0.35 * easeInOut(span(t, 0, 2.8)),
      crystals: (i) => 1.95 + i * 0.07,
    },
    /* 2. 光の柱: 一筋の光が落ちてきて、着いた所から波紋のように世界が広がる */
    beam: {
      name: '光の柱', dur: 3.5, logoAt: 2.3,
      fx(t) {
        const after = span(t, 0.7, 1.25);
        return {
          stars: span(t, 0.7, 1.4),
          slabs: [after, span(t, 0.8, 1.3), span(t, 0.9, 1.35)],
          frame: span(t, 0.75, 0.9) * (1 + 1.8 * Math.max(0, 1 - Math.abs(t - 0.85) * 4)),
          mesh: easeOut(span(t, 0.8, 1.5)),
          fiber: easeOut(span(t, 1.0, 1.8)) * 1.15,
          panels: easeOut(span(t, 2.0, 2.6)),
          spin: 0,
        };
      },
      zoom: (t) => 1.12 - 0.12 * easeOut(span(t, 0.7, 2.6)),
      crystals: (i) => 1.15 + i * 0.06,
      after(g, h, t) {
        const c = h.proj(0, h.meshY, 0);
        g.save();
        g.globalCompositeOperation = 'lighter';
        // 落ちてくる光
        const drop = easeOut(span(t, 0, 0.7));
        const fade = 1 - span(t, 0.9, 1.6);
        if (fade > 0) {
          const y = -20 + (c.y + 20) * drop;
          const lg = g.createLinearGradient(0, 0, 0, y);
          lg.addColorStop(0, 'rgba(140,240,255,0)');
          lg.addColorStop(1, `rgba(220,250,255,${0.95 * fade})`);
          g.fillStyle = lg;
          const w = 3 + 10 * span(t, 0.65, 0.8) * fade;
          g.fillRect(c.x - w / 2, 0, w, y);
          const hg = g.createRadialGradient(c.x, y, 1, c.x, y, 40);
          hg.addColorStop(0, `rgba(255,255,255,${fade})`); hg.addColorStop(1, 'rgba(140,220,255,0)');
          g.fillStyle = hg; g.beginPath(); g.arc(c.x, y, 40, 0, TAU); g.fill();
        }
        // 着地の波紋
        for (let k = 0; k < 3; k++) {
          const u = span(t, 0.7 + k * 0.12, 1.6 + k * 0.12);
          if (u <= 0 || u >= 1) continue;
          const r = h.kz * (0.2 + 2.2 * easeOut(u));
          g.strokeStyle = `rgba(160,230,255,${(1 - u) * 0.8})`;
          g.lineWidth = 2.5 * (1 - u) + 0.5;
          g.beginPath(); g.ellipse(c.x, c.y, r, r * h.sp, 0, 0, TAU); g.stroke();
        }
        // 白い閃光
        const flash = Math.max(0, 1 - Math.abs(t - 0.72) * 6);
        if (flash > 0) { g.fillStyle = `rgba(200,240,255,${flash * 0.35})`; g.fillRect(0, 0, h.w, h.h); }
        g.restore();
      },
    },
    /* 3. ワープ: 星が流れて飛び込み、回転しながら台座が現れて止まる */
    warp: {
      name: 'ワープ', dur: 3.7, logoAt: 2.5,
      fx(t) {
        const on = span(t, 1.15, 1.35);
        return {
          stars: on,
          slabs: [on, on, on],
          frame: on * (1 + 1.4 * Math.max(0, 1 - Math.abs(t - 1.3) * 4)),
          mesh: easeOut(span(t, 1.2, 1.9)),
          fiber: easeOut(span(t, 1.4, 2.2)) * 1.1,
          panels: easeOut(span(t, 2.3, 2.9)),
          spin: 7.5 * Math.pow(1 - span(t, 1.15, 3.0), 3),
        };
      },
      zoom: (t) => 0.55 + 0.45 * easeOut(span(t, 1.15, 2.8)),
      crystals: (i) => 1.6 + i * 0.05,
      init(h) {
        const R = Math.random;
        this.streaks = Array.from({ length: 160 }, () => ({ a: R() * TAU, d: R() * 0.3, s: 0.6 + R() * 1.4, hue: R() < 0.6 ? 280 : 190 }));
      },
      after(g, h, t) {
        const fade = 1 - span(t, 1.1, 1.5);
        g.save();
        g.globalCompositeOperation = 'lighter';
        if (fade > 0) {
          const cx = h.w / 2, cy = h.h * 0.45, R = Math.hypot(h.w, h.h) * 0.7;
          const speed = 0.25 + 1.8 * easeInOut(span(t, 0, 1.1));
          for (const s of this.streaks) {
            const d0 = (s.d + t * speed * s.s) % 1;
            const d1 = Math.min(1, d0 + 0.04 + 0.25 * speed * s.s * 0.4);
            const x0 = cx + Math.cos(s.a) * R * d0 * d0, y0 = cy + Math.sin(s.a) * R * d0 * d0;
            const x1 = cx + Math.cos(s.a) * R * d1 * d1, y1 = cy + Math.sin(s.a) * R * d1 * d1;
            g.strokeStyle = `hsla(${s.hue},100%,80%,${0.75 * fade * d0})`;
            g.lineWidth = 0.6 + 1.6 * d0;
            g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
          }
          const cg = g.createRadialGradient(cx, cy, 1, cx, cy, 60 + 120 * span(t, 0.6, 1.15));
          cg.addColorStop(0, `rgba(255,255,255,${0.9 * fade * span(t, 0.3, 1.1)})`);
          cg.addColorStop(1, 'rgba(160,140,255,0)');
          g.fillStyle = cg; g.beginPath(); g.arc(cx, cy, 180, 0, TAU); g.fill();
        }
        const flash = Math.max(0, 1 - Math.abs(t - 1.18) * 5);
        if (flash > 0) { g.fillStyle = `rgba(230,240,255,${flash * 0.55})`; g.fillRect(0, 0, h.w, h.h); }
        g.restore();
      },
    },
  };
  const ORDER = ['warp', 'boot', 'beam'];

  class Intro {
    constructor(root) {
      this.root = root;
      this.canvas = root.querySelector('canvas');
      this.logo = root.querySelector('.intro-logo');
      this.holo = null;
      root.addEventListener('pointerdown', () => this.finish());
    }

    static get kinds() { return ORDER.map((k) => [k, KINDS[k].name]); }

    static pref() {
      try { return localStorage.getItem('mathscape-intro') || 'warp'; } catch (e) { return 'warp'; }
    }
    static setPref(v) { try { localStorage.setItem('mathscape-intro', v); } catch (e) { /* noop */ } }

    /** kind を再生。終わったら done() */
    play(kind, done) {
      if (kind === 'random') kind = ORDER[Math.floor(Math.random() * ORDER.length)];
      const K = KINDS[kind];
      if (!K || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { this.root.hidden = true; if (done) done(); return; }
      this.done = done;
      this.kind = K;
      this.playing = true;
      this.root.hidden = false;
      this.root.classList.remove('out');
      this.logo.classList.remove('show');
      if (K.init) K.init();
      this.t = 0; // 経過時間 (再生のたびに 0 から)
      if (!this.holo) {
        this.holo = new MS.Holo(this.canvas, {
          beforeUpdate: (dt, h) => {
            if (!this.playing) return;
            this.t += dt;
            const t = this.t;
            h.fx = this.kind.fx(t);
            h.zoom = this.kind.zoom(t);
            h.idle = 0;
            if (t >= this.kind.logoAt) this.logo.classList.add('show');
            if (t >= this.kind.dur) this.finish();
          },
          afterDraw: (g, h) => { if (this.playing && this.kind.after) this.kind.after(g, h, this.t); },
        });
        this.holo.hideLabels = true;
      }
      const h = this.holo;
      h.t = 0; h.userYaw = 0; h.pitchT = 0.58; h.pitch = 0.58; h.yaw = h.yaw0;
      h.fx = K.fx(0);
      h.setValues(MS.Holo.DEFAULTS.slice());
      h.crystals.forEach((c, i) => { c.born = K.crystals(i); });
      h.setFocus(100);
      h.setActive(true);
    }

    finish() {
      if (!this.playing) return;
      this.playing = false;
      this.logo.classList.add('show');
      this.root.classList.add('out');
      const token = this.token = (this.token || 0) + 1;
      setTimeout(() => {
        if (token !== this.token || this.playing) return;
        this.root.hidden = true;
        if (this.holo) { this.holo.setActive(false); this.holo.fx = null; }
        const d = this.done; this.done = null;
        if (d) d();
      }, 700);
    }
  }

  MS.Intro = Intro;
})(window.MS);
