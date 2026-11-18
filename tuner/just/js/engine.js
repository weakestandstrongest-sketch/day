/*
 * Chord Finder JI — core engine (no DOM).
 * 構成音のパース・コード名判定・純正律（セント偏差）の計算を行う。
 * ブラウザでは window.ChordEngine、Node では module.exports として使える。
 */
(function (global) {
  'use strict';

  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
  const SOLFEGE = ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ'];
  const KANA_LETTER = { 'ド': 0, 'レ': 1, 'ミ': 2, 'ソ': 4, 'ラ': 5, 'シ': 6 };

  const mod = (n, m) => ((n % m) + m) % m;
  const accidentalText = (acc) => (acc > 0 ? '♯'.repeat(acc) : '♭'.repeat(-acc));

  function makeNote(letter, acc, octave) {
    return {
      letter,
      acc,
      octave,
      pc: mod(NATURAL_PC[letter] + acc, 12),
      name: LETTERS[letter] + accidentalText(acc),
      solfege: SOLFEGE[letter] + accidentalText(acc),
    };
  }

  /* ---------------------------------------------------------------- parse */

  const SEPARATOR = /[\s,，、・/|\-ー〜~。.]/;

  function normalize(input) {
    return String(input || '')
      .normalize('NFKC')
      .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  }

  /**
   * 構成音の文字列をパースする。
   * - カタカナ/ひらがな: ド レ ミ ファ ソ ラ シ（+ ♯ # ♭ b）
   * - 英字: A〜G（+ ♯ # ♭ b x）。大文字を含む入力では英字直後の小文字 b をフラット（bb でダブルフラット）、
   *   小文字だけの入力では b を音名 B として扱う（例: "gbd" = G B D, "AbCEb" = A♭ C E♭）。
   * - 英字の後ろに数字を付けるとオクターブ指定（C4 = 中央ド）。
   */
  function parseNotes(input) {
    const s = normalize(input);
    const caseSensitive = /[A-G]/.test(s);
    const notes = [];
    const unknown = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (SEPARATOR.test(c)) { i++; continue; }
      let letter = -1;
      let fromLetter = false;
      if (c === 'フ') {
        letter = 3;
        i += s[i + 1] === 'ァ' || s[i + 1] === 'ア' ? 2 : 1;
      } else if (c in KANA_LETTER) {
        letter = KANA_LETTER[c];
        i += c === 'ソ' && s[i + 1] === 'ル' ? 2 : 1;
      } else if (/[A-Ga-g]/.test(c)) {
        letter = 'CDEFGAB'.indexOf(c.toUpperCase());
        fromLetter = true;
        i++;
      } else {
        unknown.push(c);
        i++;
        continue;
      }
      let acc = 0;
      let asciiFlats = 0;
      while (i < s.length) {
        const cp = s.codePointAt(i);
        const d = s[i];
        if (d === '#' || d === '♯') { acc++; i++; }
        else if (d === '♭') { acc--; i++; }
        else if (d === 'x' && fromLetter) { acc += 2; i++; }
        else if (cp === 0x1d12a) { acc += 2; i += 2; }
        else if (cp === 0x1d12b) { acc -= 2; i += 2; }
        else if (d === 'b' && asciiFlats < 2 && (!fromLetter || caseSensitive)) { acc--; asciiFlats++; i++; }
        else break;
      }
      let octave = null;
      if (fromLetter && s[i] >= '0' && s[i] <= '9') {
        octave = s.charCodeAt(i) - 48;
        i++;
      }
      notes.push(makeNote(letter, acc, octave));
    }
    return { notes, unknown };
  }

  /** 各音に MIDI 番号を割り当てる。オクターブ省略時は直前の音より上に積む（最初の音は第3オクターブ）。 */
  function voice(notes) {
    let prev = null;
    const voiced = notes.map((n, index) => {
      const base = NATURAL_PC[n.letter] + n.acc;
      let midi;
      if (n.octave != null) midi = 12 * (n.octave + 1) + base;
      else if (prev == null) midi = 12 * 4 + base;
      else midi = prev + 1 + mod(n.pc - (prev + 1), 12);
      prev = midi;
      return Object.assign({}, n, { midi, index, octave: Math.floor((midi - base) / 12) - 1 });
    });
    return voiced.sort((a, b) => a.midi - b.midi || a.index - b.index);
  }

  /* -------------------------------------------------------------- chords */

  const DEGREE_SEMI = {
    '1': 0, '♭9': 1, '9': 2, '2': 2, '♯9': 3, '♭3': 3, '3': 4, '4': 5, '11': 5,
    '♯11': 6, '♭5': 6, '5': 7, '♯5': 8, '♭13': 8, '6': 9, '13': 9, '♭♭7': 9, '♭7': 10, '7': 11,
  };
  const ALTERED = new Set(['♭9', '♯9', '♯11', '♭13']);
  const TENSIONS = new Set(['♭9', '9', '♯9', '11', '♯11', '♭13', '13']);

  const TEMPLATE_BY_MASK = new Map();

  function addTemplate(suffix, degrees, cost) {
    let mask = 0;
    const degBySemi = {};
    for (const d of degrees) {
      const semi = DEGREE_SEMI[d];
      mask |= 1 << semi;
      degBySemi[semi] = d;
    }
    const prev = TEMPLATE_BY_MASK.get(mask);
    if (prev && prev.cost <= cost) return;
    TEMPLATE_BY_MASK.set(mask, { suffix, degrees, cost, mask, degBySemi });
  }

  function addSeventh(core, paren, degrees, cost, tensions) {
    const subsets = [[]];
    for (const t of tensions) {
      const n = subsets.length;
      for (let k = 0; k < n; k++) if (subsets[k].length < 3) subsets.push(subsets[k].concat(t));
    }
    for (const ts of subsets) {
      if (ts.includes('♭13') && ts.includes('13')) continue;
      if (ts.includes('9') && (ts.includes('♭9') || ts.includes('♯9'))) continue;
      const c = cost + ts.reduce((a, t) => a + (ALTERED.has(t) ? 2 : 1), 0) + (ts.length === 3 ? 1 : 0);
      const parts = paren.concat(ts);
      const name = core + (parts.length ? '(' + parts.join(',') + ')' : '');
      addTemplate(name, degrees.concat(ts), c);
      if (degrees.includes('5')) {
        addTemplate(name + '(omit5)', degrees.filter((d) => d !== '5').concat(ts), c + (ts.length ? 1 : 3));
      }
      if (!ts.length && !paren.length && (core === '7' || core === 'M7')) {
        addTemplate(name + '(omit3)', degrees.filter((d) => d !== '3'), c + 5);
      }
    }
  }

  addTemplate('', ['1', '3', '5'], 0);
  addTemplate('m', ['1', '♭3', '5'], 1);
  addTemplate('dim', ['1', '♭3', '♭5'], 3);
  addTemplate('aug', ['1', '3', '♯5'], 3);
  addTemplate('sus4', ['1', '4', '5'], 2);
  addTemplate('sus2', ['1', '2', '5'], 3);
  addTemplate('(♭5)', ['1', '3', '♭5'], 5);
  addTemplate('5', ['1', '5'], 3);
  addTemplate('(omit5)', ['1', '3'], 5);
  addTemplate('m(omit5)', ['1', '♭3'], 6);
  addTemplate('6', ['1', '3', '5', '6'], 2);
  addTemplate('m6', ['1', '♭3', '5', '6'], 3);
  addTemplate('6(9)', ['1', '3', '5', '6', '9'], 3);
  addTemplate('m6(9)', ['1', '♭3', '5', '6', '9'], 4);
  addTemplate('add9', ['1', '3', '5', '9'], 2);
  addTemplate('m(add9)', ['1', '♭3', '5', '9'], 3);
  addTemplate('add11', ['1', '3', '11', '5'], 5);
  addTemplate('sus4(9)', ['1', '9', '4', '5'], 4);
  addTemplate('dim7', ['1', '♭3', '♭5', '♭♭7'], 3);
  addSeventh('7', [], ['1', '3', '5', '♭7'], 1, ['♭9', '9', '♯9', '♯11', '♭13', '13']);
  addSeventh('M7', [], ['1', '3', '5', '7'], 1, ['9', '♯11', '13']);
  addSeventh('m7', [], ['1', '♭3', '5', '♭7'], 1, ['9', '11', '13']);
  addSeventh('mM7', [], ['1', '♭3', '5', '7'], 3, ['9', '11', '13']);
  addSeventh('m7', ['♭5'], ['1', '♭3', '♭5', '♭7'], 2, ['9', '11', '♭13']);
  addSeventh('7sus4', [], ['1', '4', '5', '♭7'], 2, ['♭9', '9', '13']);
  addSeventh('aug7', [], ['1', '3', '♯5', '♭7'], 3, ['♭9', '9', '♯9']);
  addSeventh('7', ['♭5'], ['1', '3', '♭5', '♭7'], 4, ['9']);
  addSeventh('M7', ['♯5'], ['1', '3', '♯5', '7'], 4, ['9']);

  /**
   * コード名の候補を返す（cost の小さい順）。
   * 返り値: [{ name, root, template, cost, slash }]
   */
  function identify(voiced) {
    if (!voiced.length) return [];
    const bass = voiced[0];
    const byPc = new Map();
    for (const n of voiced) if (!byPc.has(n.pc)) byPc.set(n.pc, n);
    const pcs = [...byPc.keys()];
    const found = new Map();

    const tryRoots = (set, bassOutside, extra) => {
      for (const r of set) {
        let mask = 0;
        for (const p of set) mask |= 1 << mod(p - r, 12);
        const tpl = TEMPLATE_BY_MASK.get(mask);
        if (!tpl) continue;
        const root = byPc.get(r);
        let cost = tpl.cost + extra;
        let name = root.name + tpl.suffix;
        if (bassOutside || r !== bass.pc) {
          name += '/' + bass.name;
          if (!bassOutside) cost += TENSIONS.has(tpl.degBySemi[mod(bass.pc - r, 12)]) ? 5 : 2;
        }
        const prev = found.get(name);
        if (!prev || prev.cost > cost) found.set(name, { name, root, template: tpl, cost, bassOutside });
      }
    };

    tryRoots(pcs, false, 0);
    const bassCount = voiced.filter((n) => n.pc === bass.pc).length;
    if (bassCount === 1 && pcs.length >= 3) tryRoots(pcs.filter((p) => p !== bass.pc), true, 4);

    return [...found.values()].sort(
      (a, b) =>
        a.cost - b.cost ||
        (a.root.pc === bass.pc ? 0 : 1) - (b.root.pc === bass.pc ? 0 : 1) ||
        a.name.length - b.name.length,
    );
  }

  /* ------------------------------------------------------------ intervals */

  const INTERVAL_NATURAL = [0, 2, 4, 5, 7, 9, 11];
  const INTERVAL_NUM_JA = ['1度', '2度', '3度', '4度', '5度', '6度', '7度'];

  /** 綴りを考慮した音程名（例: 長3度, 完全5度, 増4度） */
  function intervalName(a, b) {
    const num = mod(b.letter - a.letter, 7);
    const semi = mod(b.pc - a.pc, 12);
    let diff = semi - INTERVAL_NATURAL[num];
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;
    const perfect = num === 0 || num === 3 || num === 4;
    let q;
    if (perfect) q = { 0: '完全', 1: '増', 2: '重増', '-1': '減', '-2': '重減' }[diff];
    else q = { 0: '長', '-1': '短', 1: '増', '-2': '減', 2: '重増', '-3': '重減' }[diff];
    if (num === 0 && diff === 0) return '完全1度';
    return (q || '?') + INTERVAL_NUM_JA[num];
  }

  /* --------------------------------------------------- just intonation */

  // 度数ごとの純正比の候補（[分子, 分母]）。並び順に意味はなく、既定値は defaultRatio が決める。
  const RATIOS = {
    '1': [[1, 1]],
    '♭9': [[16, 15], [256, 243], [17, 16]],
    '9': [[9, 8], [10, 9]],
    '2': [[9, 8], [10, 9]],
    '♯9': [[6, 5], [75, 64], [7, 6], [19683, 16384]],
    '♭3': [[6, 5], [7, 6], [32, 27]],
    '3': [[5, 4], [81, 64], [9, 7]],
    '4': [[4, 3]],
    '11': [[4, 3], [11, 8]],
    '♯11': [[45, 32], [11, 8], [729, 512]],
    '♭5': [[64, 45], [7, 5], [1024, 729]],
    '5': [[3, 2]],
    '♯5': [[25, 16], [8, 5], [6561, 4096]],
    '♭13': [[8, 5], [25, 16], [128, 81]],
    '6': [[5, 3], [27, 16], [12, 7]],
    '13': [[5, 3], [27, 16], [12, 7]],
    '♭♭7': [[5, 3], [128, 75], [12, 7], [32768, 19683]],
    '♭7': [[9, 5], [16, 9], [7, 4]],
    '7': [[15, 8], [243, 128]],
  };

  // 調の主音から見た各半音の比（調基準モード用）
  const KEY_RATIOS = {
    just: [[1, 1], [16, 15], [9, 8], [6, 5], [5, 4], [4, 3], [45, 32], [3, 2], [8, 5], [5, 3], [16, 9], [15, 8]],
    pyth: [[1, 1], [256, 243], [9, 8], [32, 27], [81, 64], [4, 3], [729, 512], [3, 2], [128, 81], [27, 16], [16, 9], [243, 128]],
  };

  const MODES = {
    just5: '純正律（5リミット）',
    just7: '純正律（7リミット・倍音列）',
    pyth: 'ピタゴラス音律',
  };

  function primeLimit(n, d) {
    let x = n * d;
    let limit = 1;
    for (let p = 2; x > 1; p++) {
      while (x % p === 0) { x /= p; limit = p; }
    }
    return limit;
  }

  const sameRatio = (r, n, d) => r[0] === n && r[1] === d;
  const cents = (n, d) => 1200 * Math.log2(n / d);

  function defaultRatioIndex(degree, ctx, mode) {
    const opts = RATIOS[degree];
    const find = (n, d) => Math.max(0, opts.findIndex((r) => sameRatio(r, n, d)));
    if (mode === 'pyth') return Math.max(0, opts.findIndex((r) => primeLimit(r[0], r[1]) <= 3));
    if (degree === '♭7') {
      if (ctx.dominant) return mode === 'just7' ? find(7, 4) : find(16, 9);
      return find(9, 5);
    }
    if (degree === '♭5' && mode === 'just7' && ctx.diminished) return find(7, 5);
    return 0;
  }

  // 綴り上の音程から、コード外の音（分数コードのベースなど）の度数を決める
  function fallbackDegree(root, note) {
    const semi = mod(note.pc - root.pc, 12);
    const num = mod(note.letter - root.letter, 7) + 1;
    return {
      0: '1', 1: '♭9', 2: '9', 3: '♭3', 4: '3', 5: '4',
      6: num === 4 ? '♯11' : '♭5', 7: '5', 8: num === 5 ? '♯5' : '♭13',
      9: '6', 10: '♭7', 11: '7',
    }[semi];
  }

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  /** 声部の純正比を整数比（例 4:5:6）にする。大きすぎる場合は null。 */
  function integerRatio(rows) {
    const minOct = Math.min(...rows.map((r) => r.rootOctave));
    const fr = rows.map((r) => [r.ratio[0] * 2 ** (r.rootOctave - minOct), r.ratio[1]]);
    const l = fr.reduce((acc, [, d]) => (acc / gcd(acc, d)) * d, 1);
    let ints = fr.map(([n, d]) => (n * l) / d);
    const g = ints.reduce((a, b) => gcd(a, b));
    ints = ints.map((x) => x / g);
    if (ints.some((x) => !Number.isSafeInteger(x) || x > 99999)) return null;
    return ints;
  }

  /**
   * 選んだコード解釈について、各構成音の純正比とセント偏差を計算する。
   * opts: { mode, ref: 'root'|'bass'|'key', tonic (0-11), a4, overrides: {rowIndex: optionIndex} }
   */
  function tune(voiced, candidate, opts) {
    const o = Object.assign({ mode: 'just5', ref: 'root', tonic: 0, a4: 440, overrides: {} }, opts);
    const root = candidate ? candidate.root : voiced[0];
    const tpl = candidate ? candidate.template : null;
    const has = (d) => !!tpl && tpl.degrees.includes(d);
    const ctx = {
      dominant: has('♭7') && !has('♭3'),
      diminished: has('♭3') && has('♭5'),
    };

    const rows = voiced.map((note, i) => {
      const semi = mod(note.pc - root.pc, 12);
      const inChord = !!tpl && tpl.degBySemi[semi] != null;
      const degree = inChord ? tpl.degBySemi[semi] : fallbackDegree(root, note);
      const options = RATIOS[degree].map(([n, d]) => ({
        ratio: [n, d],
        label: n + '/' + d,
        limit: primeLimit(n, d),
        dev: cents(n, d) - 100 * semi,
      }));
      const def = defaultRatioIndex(degree, ctx, o.mode);
      const choice = o.overrides[i] != null && options[o.overrides[i]] ? o.overrides[i] : def;
      const opt = options[choice];
      return {
        note,
        degree,
        inChord,
        semi,
        options,
        choice,
        defaultChoice: def,
        isDefault: choice === def,
        ratio: opt.ratio,
        dev: opt.dev,
        rootOctave: (note.midi - semi - root.pc) / 12,
      };
    });

    let refOffset = 0;
    if (o.ref === 'bass') {
      refOffset = -rows[0].dev;
    } else if (o.ref === 'key') {
      const s = mod(root.pc - o.tonic, 12);
      const [n, d] = KEY_RATIOS[o.mode === 'pyth' ? 'pyth' : 'just'][s];
      refOffset = cents(n, d) - 100 * s;
    }

    for (const r of rows) {
      r.offset = refOffset + r.dev;
      r.freqET = o.a4 * 2 ** ((r.note.midi - 69) / 12);
      r.freqJI = r.freqET * 2 ** (r.offset / 1200);
    }

    const ints = integerRatio(rows);
    let fundamental = null;
    if (ints) {
      const f = rows[0].freqJI / ints[0];
      const midi = 69 + 12 * Math.log2(f / o.a4);
      fundamental = { freq: f, midi: Math.round(midi) };
    }
    return { root, rows, refOffset, ints, fundamental };
  }

  /** 文字列から判定〜純正律計算までまとめて行う */
  function analyze(input) {
    const { notes, unknown } = parseNotes(input);
    const voiced = voice(notes);
    const candidates = identify(voiced);
    return { notes: voiced, unknown, candidates };
  }

  const PC_NAMES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const PC_NAMES_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

  function midiName(midi, flat) {
    return (flat ? PC_NAMES_FLAT : PC_NAMES_SHARP)[mod(midi, 12)] + (Math.floor(midi / 12) - 1);
  }

  const API = {
    LETTERS, NATURAL_PC, SOLFEGE, MODES, RATIOS, PC_NAMES_SHARP, PC_NAMES_FLAT,
    parseNotes, voice, identify, intervalName, tune, analyze, primeLimit, cents, midiName,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ChordEngine = API;
})(typeof window !== 'undefined' ? window : globalThis);
