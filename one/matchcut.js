// テキストマッチカットの紙面を組む共通部品。アプリ（index.html）とデモ（demo.html）で使う。
// どの紙面でも「one」の中心が画面の中心に来るように組むので、カットを切り替えても「one」だけが動かない。
(function () {
  const FONTS = "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Bebas+Neue&family=Caveat:wght@600&family=DM+Serif+Display:ital@1&family=Instrument+Serif&family=Space+Mono:wght@400;700&display=swap";
  const SYS = '-apple-system, "Helvetica Neue", Arial, sans-serif';

  // 紙面の種類。kind が組み方、hl が「one」の目立たせ方
  const STYLES = [
    { kind: "page", bg: "#f2f0ea", fg: "#141414", font: '"Instrument Serif", serif', size: 58, hl: "marker" },
    { kind: "code", bg: "#1e1f26", fg: "#d7dae0", font: '"Space Mono", monospace', size: 32, hl: "select" },
    { kind: "page", bg: "#000000", fg: "#f5f5f7", font: '"Archivo Black", sans-serif', size: 44, hl: "invert", upper: true },
    { kind: "list", bg: "#ffffff", fg: "#1d1d1f", font: SYS, size: 44, weight: 600, hl: "blue" },
    { kind: "terminal", bg: "#050607", fg: "#9be7a6", font: '"Space Mono", monospace', size: 32, hl: "invert" },
    { kind: "page", bg: "#0b0c10", fg: "#e9eaee", font: '"Bebas Neue", sans-serif', size: 104, hl: "glow", upper: true },
    { kind: "dict", bg: "#f7f6f2", fg: "#1b1b1b", font: 'Georgia, "Times New Roman", serif', size: 42, hl: "bold" },
    { kind: "poster", bg: "#8fa0ff", fg: "#05060a", font: '"Archivo Black", sans-serif', size: 70, hl: "invert", upper: true },
    { kind: "receipt", bg: "#fbfaf7", fg: "#222222", font: '"Space Mono", monospace', size: 32, hl: "box", upper: true },
    { kind: "page", bg: "#e6e6e1", fg: "#1d1d1f", font: '"DM Serif Display", serif', size: 64, italic: true, hl: "marker" },
    { kind: "hand", bg: "#fdfcf8", fg: "#2a3a8c", font: '"Caveat", cursive', size: 60, weight: 600, hl: "circle" },
    { kind: "subtitle", bg: "#111111", fg: "#ffffff", font: SYS, size: 56, weight: 600, hl: "blue" },
    { kind: "page", bg: "#8fa0ff", fg: "#05060a", font: '"Space Mono", monospace', size: 30, weight: 700, hl: "box" },
    { kind: "page", bg: "#ffffff", fg: "#111111", font: 'Georgia, "Times New Roman", serif', size: 42, weight: 700, hl: "underline" },
    { kind: "page", bg: "#000000", fg: "#ffffff", font: '"Archivo Black", sans-serif', size: 54, hl: "blue" },
    { kind: "page", bg: "#ffffff", fg: "#000000", font: SYS, size: 38, weight: 700, hl: "invert" },
  ];

  const LINES = [
    "you don't need a longer list",
    "everything else can wait until tomorrow",
    "close the other tabs",
    "that is enough for today",
    "write it down before you start",
    "no notifications, no backlog",
    "small enough to finish today",
    "don't add anything else",
    "the rest is just noise",
    "start before you feel ready",
    "a single line on a blank page",
    "decide it, then do it",
    "focus is a decision",
    "stop planning and begin",
    "make today lighter",
    "the list can stay closed",
    "quiet morning, warm coffee",
    "leave the rest for tomorrow",
  ];

  const HITS = [
    ["just ", " thing."],
    ["do ", " thing today"],
    ["only ", ""],
    ["the ", " that matters"],
    ["today, just ", ""],
    ["pick ", " and let the rest go"],
    ["", " step at a time"],
    ["no. ", ""],
    ["just ", " more"],
    ["", " line, nothing else"],
    ["the only ", " you need"],
    ["", " day"],
  ];

  const CODE = [
    "function today() {",
    "  const list = tasks.filter((t) => t.matters);",
    "  // everything else can wait",
    "  return list.slice(0, 1);",
    "}",
    "if (focus) close(tabs);",
    "const noise = notifications.mute();",
    "await start();",
    "// TODO: nothing else",
    "export default today;",
    "let backlog = [];",
    "while (doing) { stay(); }",
  ];

  const TERM = [
    "$ git status",
    "nothing to commit, working tree clean",
    "$ close --all-tabs",
    "closed 37 tabs",
    "$ mute notifications",
    "done.",
    "$ ls today/",
    "1 item",
    "$ plan --next-week",
    "skipped: not today",
  ];

  const TASKS = [
    "reply to emails", "clean the inbox", "plan next week", "read that article",
    "fix the bike", "call the bank", "update the slides", "sort the photos",
    "learn a new app", "check the news", "organize the desk", "answer every message",
  ];

  const RECEIPT = [
    "TABS CLOSED ........ 37", "NOTIFICATIONS ....... 0", "MEETINGS ............ 0",
    "------------------------", "BACKLOG ............ --", "WORRY ........... VOID",
    "TIME ........... ALL DAY", "THANK YOU, COME BACK", "TOTAL THINGS TODAY",
    "------------------------",
  ];

  const DICT = [
    "/wʌn/  adjective", "1. being a single thing.", "2. the only thing needed today.",
    "3. enough.", "see also: focus, done", "origin: before the list.",
    "usage: “just this one.”", "plural: none today",
  ];

  const HAND = [
    "remember:", "not ten things", "drink water", "it's fine to stop",
    "tomorrow can wait", "slow is okay", "breathe first", "nothing else matters",
  ];

  const POSTER = ["FOCUS FOCUS FOCUS", "ENOUGH ENOUGH", "TODAY TODAY TODAY", "LESS LESS LESS", "NOW NOW NOW"];

  const HIT = '<span class="mc-hit"><span>one</span></span>';
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rest = (s) => (s ? `<span class="mc-rest">${esc(s)}</span>` : "");

  function colorize(line) {
    const i = line.indexOf("//");
    const code = i >= 0 ? line.slice(0, i) : line;
    const comment = i >= 0 ? line.slice(i) : "";
    let html = esc(code)
      .replace(/\b(const|let|function|return|if|await|export|default|while)\b/g, '<span class="mc-k">$1</span>')
      .replace(/\b(\d+)\b/g, '<span class="mc-n">$1</span>');
    if (comment) html += `<span class="mc-c">${esc(comment)}</span>`;
    return html;
  }

  // 種類ごとの行の組み方。line(n) は n 行目（0 が「one」の行）の HTML を返す
  const KINDS = {
    page: (pick) => {
      const filler = () => pick(LINES) + "  " + pick(LINES) + "  " + pick(LINES) + "  ";
      return (n) => {
        if (n !== 0) return esc(filler() + filler());
        const [pre, post] = pick(HITS);
        return rest(filler() + pre) + HIT + rest(post + "  " + filler());
      };
    },
    code: (pick) => {
      const base = 20 + Math.floor(pick([0, 1, 2, 3, 4, 5, 6, 7]) * 7);
      const ln = (n) => `<span class="mc-ln">${base + n}</span>`;
      return (n) => n === 0
        ? ln(n) + colorize("let today = ") + HIT + colorize("();  // just one")
        : ln(n) + colorize(pick(CODE));
    },
    terminal: (pick) => (n) => (n === 0 ? `<span class="mc-rest">$ do </span>${HIT}<span class="mc-rest"> --today</span>` : esc(pick(TERM))),
    list: (pick) => (n) => (n === 0
      ? '<span class="mc-box mc-box-on"></span>' + rest("just ") + HIT + rest(" thing")
      : `<span class="mc-box"></span><s>${esc(pick(TASKS))}</s>`),
    receipt: (pick) => (n) => (n === 0 ? rest("ITEMS TODAY ........ ") + HIT : esc(pick(RECEIPT))),
    dict: (pick) => (n) => (n === 0 ? HIT + rest("  /wʌn/") : esc(pick(DICT))),
    hand: (pick) => (n) => (n === 0 ? rest("just ") + HIT + rest(" thing today") : esc(pick(HAND))),
    poster: (pick) => (n) => (n === 0
      ? rest("JUST ") + HIT + rest(" THING")
      : `<span class="${n % 2 ? "mc-outline" : ""}">${esc(pick(POSTER))}</span>`),
    subtitle: () => (n) => (n === 0 ? rest("just ") + HIT + rest(" thing.") : "&nbsp;"),
  };

  const CSS = `
    .mc-stage { position: absolute; inset: 0; overflow: hidden; transform-origin: 50% 50%; }
    .mc-cut { position: absolute; inset: 0; visibility: hidden; }
    .mc-cut.on { visibility: visible; }
    .mc-page { position: absolute; left: 0; top: 0; white-space: nowrap; line-height: 1.12; }
    .mc-page p { margin: 0; opacity: 0.38; }
    .mc-page p.mc-hit-line { opacity: 1; }
    .mc-page p.mc-hit-line .mc-rest { opacity: 0.38; }
    .mc-hit { display: inline-block; padding: 0 0.08em; }

    .mc-hl-marker .mc-hit { background: #8fa0ff; color: #000; }
    .mc-hl-invert .mc-hit { background: currentColor; }
    .mc-hl-invert .mc-hit span { color: var(--mc-bg); }
    .mc-hl-box .mc-hit { outline: 0.06em solid currentColor; outline-offset: 0.04em; }
    .mc-hl-underline .mc-hit { text-decoration: underline; text-decoration-thickness: 0.08em; text-underline-offset: 0.12em; }
    .mc-hl-glow .mc-hit { color: #8fa0ff; text-shadow: 0 0 0.3em rgba(143, 160, 255, 0.8); }
    .mc-hl-blue .mc-hit { color: #4f5bd5; }
    .mc-hl-select .mc-hit { background: rgba(143, 160, 255, 0.35); color: #fff; }
    .mc-hl-bold .mc-hit { font-weight: 700; font-size: 1.5em; vertical-align: -0.12em; }
    .mc-hl-circle .mc-hit { border: 0.05em solid #d6453d; border-radius: 50%; padding: 0 0.22em; transform: rotate(-4deg); }

    /* コードエディタ */
    .mc-k-code .mc-ln { display: inline-block; width: 3.2em; padding-right: 1em; text-align: right; color: #5c6070; }
    .mc-k-code .mc-k { color: #c3a6ff; }
    .mc-k-code .mc-n { color: #f5b971; }
    .mc-k-code .mc-c { color: #6b7080; font-style: italic; }
    .mc-k-code .mc-page { line-height: 1.6; }
    .mc-k-code .mc-hit-line { background: rgba(255, 255, 255, 0.05); }
    /* ターミナル */
    .mc-k-terminal .mc-page { line-height: 1.5; }
    /* チェックリスト：ほかの用事は全部消してある */
    .mc-k-list .mc-page { line-height: 1.7; }
    .mc-k-list s { text-decoration-thickness: 0.07em; }
    .mc-box { display: inline-block; width: 0.8em; height: 0.8em; margin-right: 0.45em; border: 0.08em solid currentColor; border-radius: 0.22em; vertical-align: -0.06em; }
    .mc-box-on { border-color: #4f5bd5; background: #4f5bd5; box-shadow: inset 0 0 0 0.12em #fff; }
    /* 辞書 */
    .mc-k-dict .mc-page { line-height: 1.45; }
    /* ポスター：白抜きの行を交互に */
    .mc-k-poster .mc-page { line-height: 0.95; letter-spacing: -0.01em; }
    .mc-outline { color: transparent; -webkit-text-stroke: 0.025em #05060a; }
    /* レシート */
    .mc-k-receipt .mc-page { line-height: 1.5; letter-spacing: 0.04em; }
    /* 手書きメモ：罫線の入った紙 */
    .mc-k-hand .mc-page { line-height: 1.3; padding: 0 100vw; }
    .mc-k-hand .mc-page p { border-bottom: 1px solid rgba(51, 70, 168, 0.22); opacity: 0.55; }
    .mc-k-hand .mc-page p.mc-hit-line { opacity: 1; }
    /* 映画の字幕：上下に黒帯 */
    .mc-k-subtitle { box-shadow: inset 0 14vh 0 #000, inset 0 -14vh 0 #000; }
    .mc-k-subtitle .mc-page p.mc-hit-line .mc-rest { opacity: 1; }
    .mc-k-subtitle .mc-hit-line { text-shadow: 0 0.06em 0.2em rgba(0, 0, 0, 0.8); }
  `;

  let fontsheet = Promise.resolve();
  function inject() {
    if (document.getElementById("mc-style")) return;
    const style = document.createElement("style");
    style.id = "mc-style";
    style.textContent = CSS;
    document.head.append(style);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS;
    // @font-face が読み込まれる前に fonts.load を呼ぶと、何も読まずにすぐ終わってしまう
    fontsheet = new Promise((r) => { link.onload = r; link.onerror = r; });
    document.head.append(link);
  }

  function buildCut(stage, st, pick) {
    const k = Math.min(1.1, Math.max(0.55, innerWidth / 900));
    const px = Math.max(16, Math.round(st.size * k));
    const cut = document.createElement("div");
    cut.className = `mc-cut mc-k-${st.kind} mc-hl-${st.hl}`;
    cut.style.background = st.bg;
    cut.style.color = st.fg;
    cut.style.setProperty("--mc-bg", st.bg);

    const page = document.createElement("div");
    page.className = "mc-page";
    page.style.fontFamily = st.font;
    page.style.fontSize = `${px}px`;
    page.style.fontWeight = st.weight || 400;
    page.style.fontStyle = st.italic ? "italic" : "normal";
    page.style.textTransform = st.upper ? "uppercase" : "none";
    cut.append(page);
    stage.append(cut);

    // 画面の上から下まで埋まる行数にする
    const lh = parseFloat(getComputedStyle(page).lineHeight) || px * 1.2;
    const half = Math.ceil(innerHeight / 2 / lh) + 1;
    const line = KINDS[st.kind](pick);
    let html = "";
    for (let n = -half; n <= half; n++) {
      html += n === 0 ? `<p class="mc-hit-line">${line(0)}</p>` : `<p>${line(n)}</p>`;
    }
    page.innerHTML = html;

    // 「one」の中心が画面の中心に来るように紙面ごとずらす
    const hitEl = page.querySelector(".mc-hit");
    const pr = page.getBoundingClientRect();
    const hr = hitEl.getBoundingClientRect();
    const x = innerWidth / 2 - (hr.left - pr.left + hr.width / 2);
    const y = innerHeight / 2 - (hr.top - pr.top + hr.height / 2);
    page.style.transform = `translate(${x}px, ${y}px)`;
    return cut;
  }

  window.MatchCut = {
    STYLES,
    // フォントが揃ってから組む（揃う前に測ると「one」の位置がずれる）
    ready(timeout = 1500) {
      inject();
      const loads = fontsheet.then(() => Promise.all(STYLES.map((st) =>
        document.fonts.load(`${st.italic ? "italic " : ""}${st.weight || 400} 40px ${st.font}`, "one ONE"))));
      return Promise.race([loads, new Promise((r) => setTimeout(r, timeout))]).catch(() => {});
    },
    // count 枚のカットを stage に組んで返す。同じ seed なら毎回同じ並びになる
    build(stage, count, seed = 7) {
      inject();
      stage.classList.add("mc-stage");
      stage.innerHTML = "";
      let s = seed;
      const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const pick = (arr) => arr[Math.floor(rand() * arr.length)];
      return Array.from({ length: count }, (_, i) => buildCut(stage, STYLES[i % STYLES.length], pick));
    },
  };
})();
