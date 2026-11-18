// 遊の「本物らしさ」の入り口 — ゲームを開く前に、そのゲームの駒を撮り、盤の素材を用意する
//
// 3D が使えない環境 (WebGL なし・読み込み失敗) では何もせず、各ゲームはもとの絵で動く。
import { wood, lacquer, sisal, url } from './textures.js';

const store = {};
let M = null;

const KOMA = [
  ['K0', '玉'], ['K1', '王'], ['G', '金'], ['S', '銀'], ['B', '角'], ['R', '飛'], ['P', '歩'],
  ['+S', '全', true], ['+B', '馬', true], ['+R', '龍', true], ['+P', 'と', true],
];
export const HB_COLORS = ['#c9384a', '#3f74c4', '#5aa77a', '#e9b23a', '#7d5aa8', '#dc6b3a', '#e98ea0', '#3aa9b6'];
export const PLAYER_COLORS = ['#8fb3d1', '#e08a76'];

// 盤の地 (CSS の変数として配る)
const TEX = {
  kaya: () => wood({ light: '#ebc98a', dark: '#d9ab62', ink: '#a8742f', rings: 46, warp: 0.7, figure: 'straight', pores: 0.12, seed: 7 }),
  maple: () => wood({ light: '#ecd9b2', dark: '#dcc08e', ink: '#b8955b', rings: 26, warp: 1.1, figure: 'flat', pores: 0.1, seed: 11 }),
  walnut: () => wood({ light: '#5e3d27', dark: '#3f2718', ink: '#21130a', rings: 30, warp: 1.2, figure: 'flat', pores: 0.25, seed: 12 }),
  walnutDark: () => wood({ light: '#3b2618', dark: '#26170e', ink: '#120a05', rings: 34, warp: 1.3, figure: 'flat', pores: 0.25, seed: 15 }),
  lacquer: () => lacquer({ color: '#2a0d0e', seed: 4 }),
  sisal: () => sisal(),
};
const NEEDS = {
  chess: ['maple', 'walnut', 'walnutDark'],
  gomoku: ['kaya', 'walnutDark'],
  minishogi: ['kaya'],
  reversi: ['lacquer', 'walnutDark'],
  darts: ['sisal'],
};

function setVar(name, value) { document.documentElement.style.setProperty(name, value); }
const cssUrl = (u) => `url("${u}")`;

const idle = () => new Promise((r) => setTimeout(r, 30));

export async function prepare(id) {
  try {
    for (const t of NEEDS[id] || []) {
      if (store[`tx-${t}`]) continue;
      await idle();
      const c = TEX[t]();
      store[`tx-${t}`] = t === 'sisal' ? c : url(c);
      if (t !== 'sisal') setVar(`--tx-${t}`, cssUrl(store[`tx-${t}`]));
    }
    if (!M) M = await import('./models.js');
    await idle();
    switch (id) {
      case 'chess':
        store.chess ||= M.chessSprites();
        break;
      case 'gomoku':
      case 'reversi':
        if (!store.top) {
          store.top = M.topSprites();
          for (const k of ['go-b', 'go-w', 'rv-b', 'rv-w']) setVar(`--sp-${k}`, cssUrl(store.top[k]));
        }
        break;
      case 'minishogi':
        store.koma ||= await M.komaSprites(KOMA.map(([key, text, red]) => ({ key, text, red })));
        break;
      case 'hitblow':
        store.pegs ||= M.pegSprites(HB_COLORS);
        break;
      case 'darts':
        store.darts ||= M.dartSprites(PLAYER_COLORS);
        await Promise.all(Object.values(store.darts).map((d) => { d.img ||= new Image(); d.img.src = d.url; return d.img.decode().catch(() => {}); }));
        break;
      case 'airhockey':
        if (!store.hockey) {
          const urls = M.hockeySprites(PLAYER_COLORS);
          store.hockey = {};
          await Promise.all(Object.entries(urls).map(([k, u]) => { const im = new Image(); im.src = u; store.hockey[k] = im; return im.decode().catch(() => {}); }));
        }
        break;
      case 'yacht':
        await import('./dice.js');
        break;
      default:
        break;
    }
    document.documentElement.classList.add('real');
  } catch (e) {
    console.warn('3D の準備ができなかったので、もとの絵で表示します', e);
  }
}

// ---- 各ゲームから使う ----

export const real = {
  chess: (color, t) => store.chess?.[`${color}${t}`] || null,
  stone: (color) => store.top?.[color === 'black' || color === 1 ? 'go-b' : 'go-w'] || null,
  koma: (piece) => {
    if (!store.koma) return null;
    const key = piece.p ? `+${piece.t}` : piece.t === 'K' ? `K${piece.o}` : piece.t;
    return store.koma[key] || null;
  },
  peg: (hex) => store.pegs?.[hex] || null,
  dart: (color) => store.darts?.[color] || null,
  hockey: (key) => store.hockey?.[key] || null,
  sisal: () => store['tx-sisal'] || null,
  tex: (name) => store[`tx-${name}`] || null,
};
