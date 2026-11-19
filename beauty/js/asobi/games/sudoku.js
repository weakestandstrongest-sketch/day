import { h, gameShell, sfx, loadPref, savePref, showResult, confirm } from '../ui.js';
import { generate, LEVELS, PEERS, rowOf, colOf, boxOf } from './sudoku-logic.js';

const RULES = `
<p>9×9 のマスに 1〜9 の数字を入れるパズルです。ひとりで解きます。</p>
<ul>
<li>どの<b>横の列</b>にも、どの<b>縦の列</b>にも、太い線で囲まれたどの <b>3×3 のブロック</b>にも、1〜9 が1つずつ入ります。</li>
<li>マスを選んでから、下の数字を押して入れます。同じ数字をもう一度押すと消えます。</li>
<li><b>メモ</b>をオンにすると、入りそうな数字を小さく書いておけます。</li>
<li>答えと違う数字は赤くなります（「まちがいを知らせる」をオフにすると出ません）。</li>
<li>困ったときは<b>ヒント</b>で、選んだマスの答えを1つ見られます。</li>
</ul>`;

const SAVE = 'sudoku.save';

export function mount(root) {
  let st = null; // { level, puzzle, solution, cells, notes, mistakes, hints, time, done }
  let sel = -1, memo = false, timer = 0, undo = [];
  let opts = loadPref('sudoku.opts', { level: 'normal', check: true });

  const ui = gameShell(root, { title: '数独', rules: RULES, onRestart: () => showSetup(), onUndo: doUndo });
  const body = h('div', { class: 'sd-body' });
  ui.main.append(body);

  const save = () => { if (st && !st.done) savePref(SAVE, st); else savePref(SAVE, null); };
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!st || st.done || document.hidden) return;
      st.time++;
      const t = body.querySelector('.sd-time'); if (t) t.textContent = fmtTime(st.time);
      if (st.time % 10 === 0) save();
    }, 1000);
  }

  function showSetup() {
    clearInterval(timer);
    const saved = loadPref(SAVE, null);
    const seg = h('div', { class: 'segmented' }, Object.entries(LEVELS).map(([k, l]) => h('button', {
      class: opts.level === k ? 'on' : '',
      onclick: () => { opts = { ...opts, level: k }; savePref('sudoku.opts', opts); sfx('tap'); showSetup(); },
    }, l.name)));
    const chk = h('input', { type: 'checkbox', role: 'switch' });
    chk.checked = opts.check;
    chk.addEventListener('change', () => { opts = { ...opts, check: chk.checked }; savePref('sudoku.opts', opts); });
    body.replaceChildren(h('div', { class: 'hb-card sd-setup' },
      h('h2', {}, '数独'),
      h('div', { class: 'hb-option' }, h('span', {}, 'むずかしさ'), seg),
      h('label', { class: 'sd-switch' }, h('span', {}, 'まちがいを知らせる'), chk),
      saved && saved.puzzle ? h('button', { class: 'btn big', onclick: () => { st = saved; begin(); } },
        `続きから（${(LEVELS[saved.level] || LEVELS.normal).name}・${fmtTime(saved.time || 0)}）`) : null,
      h('button', { class: 'btn primary big', onclick: newGame }, '新しい問題')));
  }

  function newGame() {
    body.replaceChildren(h('div', { class: 'hb-card' }, h('p', { class: 'muted', style: { textAlign: 'center' } }, '問題を作っています…')));
    setTimeout(() => {
      const g = generate(opts.level);
      st = { level: opts.level, puzzle: g.puzzle, solution: g.solution, cells: g.puzzle.slice(), notes: Array(81).fill(0), mistakes: 0, hints: 0, time: 0, done: false };
      undo = [];
      sel = -1;
      save();
      begin();
    }, 30);
  }

  function begin() {
    memo = false;
    if (sel < 0) sel = st.cells.indexOf(0);
    render();
    startTimer();
    sfx('place');
  }

  const isGiven = (i) => st.puzzle[i] !== 0;
  const wrong = (i) => opts.check && st.cells[i] && st.cells[i] !== st.solution[i];

  function render() {
    const v = sel >= 0 ? st.cells[sel] : 0;
    const grid = h('div', { class: 'sd-grid' }, st.cells.map((n, i) => {
      const cls = ['sd-cell'];
      if (isGiven(i)) cls.push('given');
      if (i === sel) cls.push('sel');
      else if (sel >= 0 && (rowOf(i) === rowOf(sel) || colOf(i) === colOf(sel) || boxOf(i) === boxOf(sel))) cls.push('peer');
      if (v && n === v) cls.push('same');
      if (wrong(i)) cls.push('bad');
      if (colOf(i) % 3 === 2 && colOf(i) < 8) cls.push('br');
      if (rowOf(i) % 3 === 2 && rowOf(i) < 8) cls.push('bb');
      const inner = n ? String(n) : st.notes[i]
        ? h('span', { class: 'sd-notes' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => h('i', {}, st.notes[i] & (1 << d) ? String(d) : '')))
        : '';
      return h('button', { class: cls.join(' '), onclick: () => { sel = i; sfx('tap'); render(); } }, inner);
    }));
    const counts = Array(10).fill(0);
    st.cells.forEach((n, i) => { if (n && n === st.solution[i]) counts[n]++; });
    const pad = h('div', { class: 'sd-pad' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => h('button', {
      class: `sd-num ${counts[d] >= 9 ? 'full' : ''}`,
      onclick: () => input(d),
    }, h('b', {}, String(d)), h('small', {}, counts[d] >= 9 ? '✓' : String(9 - counts[d])))));
    const tools = h('div', { class: 'sd-tools' },
      h('button', { class: `sd-tool ${memo ? 'on' : ''}`, onclick: () => { memo = !memo; sfx('tap'); render(); } }, h('b', {}, '✎'), h('small', {}, memo ? 'メモ オン' : 'メモ')),
      h('button', { class: 'sd-tool', onclick: erase }, h('b', {}, '⌫'), h('small', {}, '消す')),
      h('button', { class: 'sd-tool', onclick: hint }, h('b', {}, '?'), h('small', {}, 'ヒント')));
    body.replaceChildren(
      h('div', { class: 'sd-status' },
        h('span', {}, (LEVELS[st.level] || LEVELS.normal).name),
        h('span', { class: 'sd-time' }, fmtTime(st.time)),
        h('span', {}, opts.check ? `まちがい ${st.mistakes}` : `ヒント ${st.hints}`)),
      h('div', { class: 'sd-wrap' }, grid),
      tools, pad);
    ui.setUndoEnabled(undo.length > 0);
  }

  function push() { undo.push({ i: sel, v: st.cells[sel], n: st.notes[sel], notes: null }); if (undo.length > 200) undo.shift(); }

  function input(d) {
    if (!st || st.done || sel < 0 || isGiven(sel)) return;
    push();
    if (memo) {
      if (st.cells[sel]) { undo.pop(); return; }
      st.notes[sel] ^= 1 << d;
      sfx('tap');
    } else if (st.cells[sel] === d) {
      st.cells[sel] = 0;
      sfx('tap');
    } else {
      st.cells[sel] = d;
      st.notes[sel] = 0;
      if (d !== st.solution[sel]) { if (opts.check) { st.mistakes++; sfx('error'); } else sfx('place'); }
      else {
        sfx('place');
        // 同じ行・列・ブロックのメモから、その数字を消す
        for (const p of PEERS[sel]) st.notes[p] &= ~(1 << d);
      }
    }
    save();
    render();
    check();
  }

  function erase() {
    if (!st || st.done || sel < 0 || isGiven(sel) || (!st.cells[sel] && !st.notes[sel])) return;
    push();
    st.cells[sel] = 0; st.notes[sel] = 0;
    sfx('tap'); save(); render();
  }

  async function hint() {
    if (!st || st.done) return;
    let i = sel;
    if (i < 0 || isGiven(i) || st.cells[i] === st.solution[i]) i = st.cells.findIndex((n, k) => n !== st.solution[k]);
    if (i < 0) return;
    if (!(await confirm('選んだマスの答えを入れますか？', '入れる'))) return;
    sel = i; push();
    st.cells[i] = st.solution[i]; st.notes[i] = 0; st.hints++;
    for (const p of PEERS[i]) st.notes[p] &= ~(1 << st.solution[i]);
    sfx('place'); save(); render(); check();
  }

  function doUndo() {
    const u = undo.pop(); if (!u || !st || st.done) return;
    st.cells[u.i] = u.v; st.notes[u.i] = u.n; sel = u.i;
    save(); render();
  }

  async function check() {
    if (st.cells.some((n, i) => n !== st.solution[i])) return;
    st.done = true;
    clearInterval(timer);
    save();
    const key = 'sudoku.best.' + st.level, best = loadPref(key, null);
    const isBest = !st.hints && (best == null || st.time < best);
    if (isBest) savePref(key, st.time);
    sfx('win');
    const r = await showResult({
      title: 'できました',
      detail: h('div', {},
        h('p', {}, `${(LEVELS[st.level] || LEVELS.normal).name}・${fmtTime(st.time)}`),
        h('p', { class: 'muted' }, [opts.check ? `まちがい ${st.mistakes}` : '', st.hints ? `ヒント ${st.hints}` : '', isBest ? 'いちばん速い記録です' : best != null ? `いちばん速い記録 ${fmtTime(best)}` : ''].filter(Boolean).join(' ・ '))),
      buttons: [{ label: '閉じる', value: 'close' }, { label: '次の問題', value: 'again', primary: true }],
    });
    if (r === 'again') newGame();
  }

  const onKey = (e) => {
    if (!st || st.done || document.body.dataset.view !== 'game') return;
    if (/^[1-9]$/.test(e.key)) input(+e.key);
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') erase();
    else if (sel >= 0 && e.key.startsWith('Arrow')) {
      const d = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
      const n = sel + d; if (n >= 0 && n < 81) { sel = n; render(); }
    }
  };
  addEventListener('keydown', onKey);

  showSetup();
  return () => { clearInterval(timer); removeEventListener('keydown', onKey); save(); };
}
