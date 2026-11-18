/* Mathspace — 全体の結線 */
(function (MS) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const canvas = $('space');
  const calcEl = $('calc');
  const trash = $('trash');
  const ghost = $('ghost');
  const picker = $('opPicker');
  const hint = $('hint');

  const world = new MS.World(canvas);

  /* ---------- トースト ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function hideHint() { hint.classList.add('gone'); }

  /* ---------- ぷにを生む (要素から飛んでくる演出つき) ---------- */
  function spawn(v, fromEl, at) {
    v = MS.clean(v);
    if (!MS.isValid(v)) { toast('この数はぷにできません'); return; }
    const sr = stage.getBoundingClientRect();
    const tx = at ? at.x : sr.width * (0.25 + Math.random() * 0.5);
    const ty = at ? at.y : Math.min(90, sr.height * 0.2);
    if (fromEl && !at) {
      const r = fromEl.getBoundingClientRect();
      const fly = document.createElement('div');
      fly.className = 'fly';
      fly.textContent = MS.short(v);
      fly.style.setProperty('--h', MS.blobHue(v));
      fly.style.left = r.left + r.width / 2 + 'px';
      fly.style.top = r.top + r.height / 2 + 'px';
      document.body.appendChild(fly);
      requestAnimationFrame(() => {
        fly.style.transform = `translate(${sr.left + tx - (r.left + r.width / 2)}px, ${sr.top + ty - (r.top + r.height / 2)}px) scale(1.4)`;
        fly.style.opacity = '0.2';
      });
      setTimeout(() => { fly.remove(); world.add(tx, ty, v, { vy: 2 }); }, 380);
    } else {
      world.add(tx, ty, v, { vy: at ? 0 : 2 });
    }
    hideHint();
  }

  /* ---------- 計算機 ---------- */
  const calc = new MS.Calculator({
    exprEl: $('expr'),
    resultEl: $('result'),
    keysEl: $('keys'),
    historyEl: $('history'),
    onEvaluate: () => {
      $('result').classList.remove('pulse');
      void $('result').offsetWidth;
      $('result').classList.add('pulse');
    },
  });

  const inspector = new MS.Inspector($('inspector'), {
    spawn: (v, el) => spawn(v, el),
    toCalc: (v) => { calc.insertValue(v); toast(`計算機に ${MS.fmt(v)} を入れました`); pulseCalc(); },
    close: () => {},
  });

  function pulseCalc() {
    calcEl.classList.remove('got');
    void calcEl.offsetWidth;
    calcEl.classList.add('got');
  }

  $('btnInspect').addEventListener('click', () => inspector.open(calc.value, false));
  $('btnPuni').addEventListener('click', (e) => spawn(calc.value, $('result')));
  $('result').addEventListener('click', (e) => {
    if ($('result')._dragged) return;
    inspector.open(calc.value, false);
  });
  $('result').addEventListener('keydown', (e) => { if (e.key === 'Enter') inspector.open(calc.value, false); });
  $('history').addEventListener('click', (e) => {
    const h = e.target.closest('.hist');
    if (!h || h._dragged) return;
    inspector.open(parseFloat(h.dataset.value), false);
  });

  /* ---------- DOM の数字をドラッグして空間へ ---------- */
  (function domDrag() {
    let st = null;
    const valueOf = (el) => {
      if (el.id === 'result') return calc.value;
      return parseFloat(el.dataset.v != null ? el.dataset.v : el.dataset.value);
    };
    const overStage = (x, y) => {
      const r = stage.getBoundingClientRect();
      const ir = $('inspector').getBoundingClientRect();
      const insp = !$('inspector').hidden && x >= ir.left && x <= ir.right && y >= ir.top && y <= ir.bottom;
      return !insp && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const el = e.target.closest('.nchip-main, .hist, #result');
      if (!el) return;
      const v = valueOf(el);
      if (!MS.isValid(v)) return;
      st = { el, v, x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false };
    });
    document.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      if (!st.dragging && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) {
        st.dragging = true;
        ghost.hidden = false;
        ghost.textContent = MS.short(st.v);
        ghost.style.setProperty('--h', MS.blobHue(st.v));
        document.body.classList.add('dragging-num');
      }
      if (st.dragging) {
        e.preventDefault();
        ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        stage.classList.toggle('drop-hover', overStage(e.clientX, e.clientY));
      }
    }, { passive: false });
    const end = (e, cancel) => {
      if (!st || e.pointerId !== st.id) return;
      if (st.dragging) {
        const el = st.el;
        el._dragged = true;
        setTimeout(() => { el._dragged = false; }, 50);
        ghost.hidden = true;
        document.body.classList.remove('dragging-num');
        stage.classList.remove('drop-hover');
        if (!cancel && overStage(e.clientX, e.clientY)) {
          const r = stage.getBoundingClientRect();
          spawn(st.v, null, { x: e.clientX - r.left, y: e.clientY - r.top });
        }
      }
      st = null;
    };
    document.addEventListener('pointerup', (e) => end(e, false));
    document.addEventListener('pointercancel', (e) => end(e, true));
  })();

  /* ---------- 空間のぷにを操作 ---------- */
  let drag = null;
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inside = (el, e) => {
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };

  canvas.addEventListener('pointerdown', (e) => {
    const p = local(e);
    const b = world.blobAt(p.x, p.y);
    closePicker();
    if (!b) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drag = { b, id: e.pointerId, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
    world.startGrab(b, p.x, p.y);
    hideHint();
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (!drag) {
      canvas.style.cursor = world.blobAt(p.x, p.y) ? 'grab' : 'default';
      return;
    }
    if (e.pointerId !== drag.id) return;
    world.moveGrab(Math.max(0, Math.min(world.w, p.x)), Math.max(0, Math.min(world.h, p.y)));
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
      drag.moved = true;
      stage.classList.add('grabbing');
    }
    if (drag.moved) {
      canvas.style.cursor = 'grabbing';
      world.highlight = world.overlapping(drag.b);
      trash.classList.toggle('hot', inside(trash, e));
      calcEl.classList.toggle('drop-target', inside(calcEl, e));
    }
  });

  const endDrag = (e, cancel) => {
    if (!drag || e.pointerId !== drag.id) return;
    const b = drag.b;
    const quick = performance.now() - drag.t < 400;
    stage.classList.remove('grabbing');
    calcEl.classList.remove('drop-target');
    trash.classList.remove('hot');
    if (!cancel && !drag.moved && quick) {
      b.poke(0.22);
      inspector.open(b.value, false);
    } else if (!cancel && inside(trash, e)) {
      world.remove(b);
      toast(`${MS.fmt(b.value)} を消しました`);
    } else if (!cancel && inside(calcEl, e)) {
      calc.insertValue(b.value);
      pulseCalc();
      toast(`計算機に ${MS.fmt(b.value)} を入れました`);
    } else if (!cancel && world.highlight) {
      openPicker(b, world.highlight);
    }
    world.highlight = null;
    world.endGrab();
    drag = null;
    canvas.style.cursor = 'default';
  };
  canvas.addEventListener('pointerup', (e) => endDrag(e, false));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

  // ダブルクリックで計算機の答えをその場にぷに化
  canvas.addEventListener('dblclick', (e) => {
    const p = local(e);
    if (world.blobAt(p.x, p.y)) return;
    spawn(calc.value, null, p);
  });

  /* ---------- 合体の演算ピッカー ---------- */
  const lab = MS.lab;
  const OPS = [
    { s: '+', name: 'たす', f: (a, b) => a + b, ex: (a, b) => `${a} + ${b}` },
    { s: '−', name: 'ひく', f: (a, b) => a - b, ex: (a, b) => `${a} − ${b}` },
    { s: '×', name: 'かける', f: (a, b) => a * b, ex: (a, b) => `${a} × ${b}` },
    { s: '÷', name: 'わる', f: (a, b) => (b === 0 ? NaN : a / b), ex: (a, b) => `${a} ÷ ${b}` },
    { s: 'xʸ', name: 'べき乗', f: (a, b) => Math.pow(a, b), ex: (a, b) => `${a} ^ ${b}` },
    { s: 'mod', name: 'あまり', f: (a, b) => (b === 0 ? NaN : ((a % b) + b) % b), ex: (a, b) => `${a} mod ${b}` },
    { s: 'gcd', name: '最大公約数', f: (a, b) => lab.gcd(a, b), ex: (a, b) => `gcd(${a}, ${b})` },
    { s: 'lcm', name: '最小公倍数', f: (a, b) => lab.lcm(a, b), ex: (a, b) => `lcm(${a}, ${b})` },
    { s: 'avg', name: '平均', f: (a, b) => (a + b) / 2, ex: (a, b) => `avg(${a}, ${b})` },
    { s: '⧺', name: 'つなげる', f: (a, b) => (lab.isInt(a) && lab.isInt(b) && a >= 0 && b >= 0 ? parseFloat(`${a}${b}`) : NaN), ex: (a, b) => `${a} ⧺ ${b}` },
  ];
  let pick = null;

  function openPicker(a, b) {
    pick = { a, b };
    renderPicker();
    picker.hidden = false;
    positionPicker();
  }
  function renderPicker() {
    const { a, b } = pick;
    const A = a.value, B = b.value;
    picker.innerHTML =
      `<div class="op-head"><span class="pv" style="--h:${a.hue}">${MS.short(A)}</span>` +
      `<button type="button" class="op-swap" data-swap title="入れ替え">⇄</button>` +
      `<span class="pv" style="--h:${b.hue}">${MS.short(B)}</span>` +
      `<button type="button" class="op-x" data-cancel aria-label="やめる">✕</button></div>` +
      `<div class="op-grid">` +
      OPS.map((o, i) => {
        const r = MS.clean(o.f(A, B));
        const ok = MS.isValid(r);
        return `<button type="button" data-op="${i}" ${ok ? '' : 'disabled'} title="${o.name}"><i>${o.s}</i><small>${ok ? MS.short(r) : '—'}</small></button>`;
      }).join('') + `</div>`;
  }
  function positionPicker() {
    if (!pick) return;
    if (pick.a.dying || pick.b.dying) { closePicker(); return; }
    const mx = (pick.a.cx + pick.b.cx) / 2, my = Math.min(pick.a.cy, pick.b.cy) - Math.max(pick.a.R, pick.b.R) - 12;
    // ぷにが大きく動いたときだけ追従 (小さな揺れでは動かさない)
    if (pick.ax != null && Math.hypot(mx - pick.ax, my - pick.ay) < 30) return;
    pick.ax = mx; pick.ay = my;
    const pw = picker.offsetWidth, ph = picker.offsetHeight;
    const x = Math.round(Math.max(8, Math.min(world.w - pw - 8, mx - pw / 2)));
    const y = Math.round(Math.max(8, Math.min(world.h - ph - 8, my - ph)));
    picker.style.transform = `translate(${x}px, ${y}px)`;
  }
  function closePicker() { pick = null; picker.hidden = true; }
  world.onFrame = positionPicker;

  picker.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !pick) return;
    if (t.hasAttribute('data-cancel')) { closePicker(); return; }
    if (t.hasAttribute('data-swap')) { pick = { a: pick.b, b: pick.a, ax: pick.ax, ay: pick.ay }; renderPicker(); return; }
    const o = OPS[+t.dataset.op];
    if (!o) return;
    const { a, b } = pick;
    const r = MS.clean(o.f(a.value, b.value));
    if (!MS.isValid(r)) { toast('この組み合わせは計算できません'); return; }
    const expr = o.ex(MS.fmt(a.value), MS.fmt(b.value));
    closePicker();
    world.merge(a, b, r);
    toast(`${expr} = ${MS.fmt(r)}`);
    calc.addExternalHistory(o.ex(MS.raw(a.value), MS.raw(b.value)), r);
  });

  /* ---------- ヘッダーの操作 ---------- */
  $('btnGravity').addEventListener('click', (e) => {
    world.gravity = !world.gravity;
    e.currentTarget.setAttribute('aria-pressed', String(!world.gravity));
    e.currentTarget.textContent = world.gravity ? '⟡ 無重力' : '⟡ 重力';
    if (!world.gravity) for (const b of world.blobs) for (const p of b.pts) { p.oy = p.y + 1.5 + Math.random(); }
    toast(world.gravity ? '重力 ON' : '無重力 — ふわふわ漂います');
  });
  const FUN = [100, 12, 7, 365, 3.14, 24, 60, 2, 1000, 8, 42, 0.5, 144, 17, 9, 1.08];
  let funIdx = 0;
  $('btnSpawn').addEventListener('click', () => { spawn(FUN[funIdx++ % FUN.length]); });
  $('btnClear').addEventListener('click', () => { world.clear(); closePicker(); });
  $('btnHelp').addEventListener('click', () => { $('help').hidden = false; });
  $('btnHelpClose').addEventListener('click', () => { $('help').hidden = true; });
  $('help').addEventListener('click', (e) => { if (e.target.id === 'help') $('help').hidden = true; });

  /* ---------- ホログラム・ビュー ---------- */
  const mobileMQ = window.matchMedia('(max-width: 820px)');
  const holo = new MS.Holo($('holo'), {
    onFocus: (v) => { $('holoFocus').textContent = MS.fmt(v); },
  });
  const liveValues = () => world.blobs.filter((b) => !b.dying).map((b) => b.value);
  function setTiltUI() {
    const b = $('holoTilt');
    b.setAttribute('aria-pressed', String(!!holo.tiltWanted));
    b.textContent = holo.tiltWanted ? '📱 傾き ON' : '📱 傾き';
  }
  function tryTilt() {
    holo.enableTilt().then((ok) => {
      if (!ok) { holo.disableTilt(); toast('傾きセンサーが使えません — ドラッグで回せます'); }
      setTiltUI();
    });
  }
  function setHolo(on, fromGesture) {
    closePicker();
    const full = on && mobileMQ.matches;
    document.body.classList.toggle('holo-full', full);
    if (MS.sheet) MS.sheet.setOpen(false);
    holo.setValues(liveValues());
    if (on) holo.setFocus(holo.crystals.some((c) => c.v === calc.value) ? calc.value : (holo.crystals[0] ? holo.crystals[0].v : calc.value));
    holo.setActive(on);
    $('holoHud').hidden = !on;
    hint.hidden = on;
    stage.classList.toggle('holo-on', on);
    $('btnHolo').setAttribute('aria-pressed', String(on));
    if (!on) { holo.disableTilt(); setTiltUI(); requestAnimationFrame(() => world.resize()); }
    if (full && fromGesture) {
      tryTilt(); // iPhone の許可ダイアログはボタン操作の中でしか出せない
      toast('傾けて回す · はじいて結晶を選ぶ · パネル長押しで拡大');
    }
    try { history.replaceState(null, '', on ? '#holo' : location.pathname + location.search); } catch (e) { /* noop */ }
  }
  $('btnHolo').addEventListener('click', () => setHolo(!holo.active, true));
  $('holoBack').addEventListener('click', () => setHolo(false));
  $('holoClose').addEventListener('click', () => setHolo(false));
  $('holoInspect').addEventListener('click', () => inspector.open(holo.focus, false));
  $('holoTilt').addEventListener('click', () => {
    if (holo.tiltWanted) { holo.disableTilt(); setTiltUI(); } else tryTilt();
  });
  window.addEventListener('resize', () => {
    if (holo.active) document.body.classList.toggle('holo-full', mobileMQ.matches);
  });
  // 計算すると、答えが光になって台座へ飛び込み、新しい結晶が生まれる
  const prevEval = calc.onEvaluate;
  calc.onEvaluate = (v, expr) => {
    prevEval(v, expr);
    if (!holo.active) return;
    const vals = liveValues();
    if (!vals.includes(v)) { world.add(world.w / 2, 60, v, { vy: 1 }); vals.push(v); }
    const hr = $('holo').getBoundingClientRect(), rr = $('result').getBoundingClientRect();
    const launch = () => {
      const r2 = $('result').getBoundingClientRect();
      const from = { x: Math.max(20, Math.min(hr.width - 20, r2.right - 40 - hr.left)), y: Math.min(hr.height - 10, r2.top - hr.top + r2.height / 2) };
      holo.setValues(vals, v, from);
    };
    if (MS.sheet && mobileMQ.matches && calcEl.classList.contains('open')) {
      MS.sheet.setOpen(false);
      setTimeout(launch, 260);
    } else launch();
    void rr;
  };
  if (location.hash === '#holo') setTimeout(() => setHolo(true), MS.Intro.pref() === 'off' ? 600 : 3400);

  /* ---------- スマホ: 計算機を下から引き出すシート ---------- */
  (function sheet() {
    const mq = window.matchMedia('(max-width: 820px)');
    const handle = $('sheetHandle');
    let st = null;
    const offsetY = () => {
      const r = calcEl.getBoundingClientRect();
      return r.top - (window.innerHeight - r.height);
    };
    const closedY = () => {
      const peek = parseFloat(getComputedStyle(calcEl).getPropertyValue('--peek')) || 158;
      return Math.max(0, calcEl.offsetHeight - peek);
    };
    const setOpen = (on) => {
      calcEl.classList.toggle('open', on);
      handle.setAttribute('aria-expanded', String(on));
    };
    const isGrabZone = (t) => t.closest('#sheetHandle') ||
      (!t.closest('button, #result, .history') && (t.closest('.display') || t === calcEl || t.closest('.hist-title')));
    calcEl.addEventListener('pointerdown', (e) => {
      if (!mq.matches || !isGrabZone(e.target)) return;
      st = { onHandle: !!e.target.closest('#sheetHandle'), y: e.clientY, base: offsetY(), max: closedY(), t: performance.now(), moved: false, id: e.pointerId, ly: e.clientY, lt: performance.now(), v: 0 };
      calcEl.setPointerCapture(e.pointerId);
    });
    calcEl.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dy = e.clientY - st.y;
      if (!st.moved && Math.abs(dy) > 6) { st.moved = true; calcEl.classList.add('dragging'); }
      if (!st.moved) return;
      const now = performance.now();
      st.v = (e.clientY - st.ly) / Math.max(1, now - st.lt);
      st.ly = e.clientY; st.lt = now;
      let y = st.base + dy;
      if (y < 0) y *= 0.3; // 開ききったら少し抵抗
      y = Math.min(st.max, y);
      calcEl.style.transform = `translateY(${y}px)`;
    });
    const end = (e) => {
      if (!st || e.pointerId !== st.id) return;
      calcEl.classList.remove('dragging');
      if (st.moved) {
        const y = st.base + (e.clientY - st.y);
        const open = st.v < -0.35 ? true : st.v > 0.35 ? false : y < st.max / 2;
        calcEl.style.transform = '';
        setOpen(open);
      } else if (st.onHandle) {
        setOpen(!calcEl.classList.contains('open'));
      }
      st = null;
    };
    calcEl.addEventListener('pointerup', end);
    calcEl.addEventListener('pointercancel', (e) => { if (st) { calcEl.classList.remove('dragging'); calcEl.style.transform = ''; st = null; } });
    handle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!calcEl.classList.contains('open')); }
    });
    MS.sheet = { setOpen };
    // ぷに化したら空間が見えるよう閉じる
    $('btnPuni').addEventListener('click', () => { if (mq.matches) setOpen(false); });
  })();

  /* ---------- ゲーム: 2ⁿ DROP ---------- */
  const game = new MS.Game($('game'), {
    toast,
    onClose: () => { world.paused = false; world.resize(); },
  });
  $('btnGame').addEventListener('click', () => {
    if (holo.active) setHolo(false);
    world.paused = true; // 裏のぷに空間は止めておく
    game.show();
    $('game').focus();
  });

  /* ---------- 履歴の一覧 (🕘) ---------- */
  (function historyPanel() {
    const panel = $('histPanel'), list = $('histList'), btn = $('btnHistory');
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    function render() {
      $('histCount').textContent = calc.history.length ? calc.history.length : '';
      if (!calc.history.length) {
        list.innerHTML = '<p class="hp-empty">まだ計算していません。<br>「=」を押すと、ここに式と答えが残ります。</p>';
        return;
      }
      list.innerHTML = calc.history.map((h, i) =>
        `<div class="hp-row">` +
          `<button type="button" class="hp-main" data-i="${i}"><span>${esc(MS.prettyExpr(h.expr))} =</span><b>${esc(MS.fmt(h.v))}</b></button>` +
          `<button type="button" class="hp-act" data-i="${i}" data-act="puni" aria-label="ぷにする">◉</button>` +
          `<button type="button" class="hp-act" data-i="${i}" data-act="look" aria-label="調べる">🔍</button>` +
        `</div>`).join('');
    }
    function open(on) {
      if (on) render();
      panel.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
      if (on && MS.sheet && mobileMQ.matches) MS.sheet.setOpen(true);
    }
    btn.addEventListener('click', (e) => { e.stopPropagation(); open(panel.hidden); });
    $('histClose').addEventListener('click', () => open(false));
    $('histClear').addEventListener('click', () => { calc.clearHistory(); render(); });
    list.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      const h = calc.history[+t.dataset.i];
      if (!h) return;
      if (t.dataset.act === 'puni') { spawn(h.v, t); return; }
      if (t.dataset.act === 'look') { inspector.open(h.v, false); return; }
      calc.loadExpr(h.expr, h.v);
      open(false);
      toast('式を計算機に戻しました');
    });
    const prevRender = calc.renderHistory.bind(calc);
    calc.renderHistory = () => { prevRender(); if (!panel.hidden) render(); $('histCount').textContent = calc.history.length || ''; };
  })();

  /* ---------- キーボード ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const map = { '*': '×', 'x': '×', '/': '÷', '-': '-', '+': '+', '^': '^', '%': '%', '(': '(', ')': ')', '.': '.', 'p': 'π' };
    if (/^[0-9]$/.test(k)) calc.press(k);
    else if (map[k]) calc.press(map[k]);
    else if (k === 'Enter' || k === '=') { if (e.target.closest && e.target.closest('button, [role="button"]') && !e.target.closest('#keys')) return; calc.press('eq'); }
    else if (k === 'Backspace') calc.press('back');
    else if (k === 'Escape') {
      if (!$('histPanel').hidden) $('histPanel').hidden = true;
      else if (pick) closePicker();
      else if (!$('help').hidden) $('help').hidden = true;
      else if (!$('inspector').hidden) inspector.close();
      else calc.press('clear');
    } else return;
    e.preventDefault();
  });

  /* ---------- 最初のぷにたち ---------- */
  const r0 = stage.getBoundingClientRect();
  [[100, 0.3], [12, 0.5], [7, 0.68], [3.14, 0.42]].forEach(([v, fx], i) => {
    setTimeout(() => world.add(r0.width * fx, 60 + i * 10, v, { vy: 1 }), 250 + i * 260);
  });
  /* ---------- 起動アニメーション ---------- */
  const intro = new MS.Intro($('intro'));
  function afterIntro() {
    try {
      if (!localStorage.getItem('mathscape-seen') && location.hash !== '#holo') {
        $('help').hidden = false;
        localStorage.setItem('mathscape-seen', '1');
      }
    } catch (e) { /* storage 不可 */ }
  }
  (function introPref() {
    const box = $('introPref');
    const opts = MS.Intro.kinds.concat([['random', 'おまかせ'], ['off', 'なし']]);
    const render = () => {
      const cur = MS.Intro.pref();
      box.innerHTML = opts.map(([k, n]) => `<button type="button" data-k="${k}" class="${k === cur ? 'on' : ''}">${n}</button>`).join('');
    };
    render();
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      MS.Intro.setPref(b.dataset.k);
      render();
    });
    $('introPreview').addEventListener('click', () => {
      const k = MS.Intro.pref();
      $('help').hidden = true;
      intro.play(k === 'off' ? 'random' : k, () => { $('help').hidden = false; });
    });
  })();
  const pref = MS.Intro.pref();
  if (pref === 'off') { $('intro').hidden = true; afterIntro(); }
  else intro.play(pref, afterIntro);

  MS.app = { world, calc, inspector, spawn, holo, setHolo, game };
})(window.MS);
