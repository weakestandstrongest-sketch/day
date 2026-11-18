// 候の右のタブ「遊」。下のバーとハッシュで、候 / 遊のメニュー / 各ゲームを切り替える
//
//   #ko (または空)  … 候
//   #asobi          … 遊のメニュー
//   #<ゲームの id>  … そのゲーム (下のバーは隠れる)
import { h, settings, saveSettings, closeAllOverlays, unlockAudio, sfx } from './ui.js';
import { ART } from './art.js';
import { prepare } from './real/index.js';
import * as yacht from './games/yacht.js';
import * as hitblow from './games/hitblow.js';
import * as gomoku from './games/gomoku.js';
import * as reversi from './games/reversi.js';
import * as chess from './games/chess.js';
import * as minishogi from './games/minishogi.js';
import * as airhockey from './games/airhockey.js';
import * as darts from './games/darts.js';

export const GAMES = [
  { id: 'yacht', title: 'ヨット', en: 'Yacht', desc: 'サイコロ5つで役をそろえる', tag: 'ダイス', mod: yacht },
  { id: 'hitblow', title: 'ヒット&ブロー', en: 'Hit & Blow', desc: '相手の色の並びを推理する', tag: '推理', mod: hitblow },
  { id: 'gomoku', title: '五目並べ', en: 'Gomoku', desc: '先に5つ並べたら勝ち', tag: '盤上', mod: gomoku },
  { id: 'reversi', title: 'リバーシ', en: 'Reversi', desc: 'はさんでひっくり返す', tag: '盤上', mod: reversi },
  { id: 'chess', title: 'チェス', en: 'Chess', desc: 'キングを追い詰める', tag: '盤上', mod: chess },
  { id: 'minishogi', title: '5五将棋', en: 'Minishogi', desc: '5×5マスの小さな将棋', tag: '盤上', mod: minishogi },
  { id: 'airhockey', title: 'エアホッケー', en: 'Air Hockey', desc: 'ふたり同時に打ち合う', tag: '卓上', mod: airhockey },
  { id: 'darts', title: 'ダーツ', en: 'Darts', desc: '狙って、離して、投げる', tag: '的', mod: darts },
];

const KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const BASE_TITLE = '候 KŌ';

const view = document.getElementById('asobi');
const app = document.getElementById('app');
const bar = document.getElementById('tabbar');
let cleanup = null;
let menuBuilt = false;
let routeId = 0;

function renderMenu() {
  const toggle = (key, label, desc) => {
    const input = h('input', { type: 'checkbox', role: 'switch', id: `pref-${key}` });
    input.checked = settings[key];
    input.addEventListener('change', () => { settings[key] = input.checked; saveSettings(); sfx('tap'); });
    return h('label', { class: 'a-setting', for: `pref-${key}` },
      h('span', { class: 'a-setting-text' }, h('strong', {}, label), h('small', {}, desc)),
      input);
  };
  const screen = h('div', { class: 'a-menu' },
    h('header', { class: 'a-top' },
      h('div', { class: 'a-mark label' }, h('b', {}, '遊'), 'Asobi — games for two'),
      h('div', { class: 'label a-count' }, `${GAMES.length} games · 1 device`)),
    h('aside', { class: 'a-title' },
      h('span', { class: 'a-seal' }, '二人'),
      h('h1', {}, 'あそび'),
      h('span', { class: 'a-read' }, 'ひとつの画面を、ふたりで')),
    h('nav', { class: 'a-list', 'aria-label': 'ゲーム' },
      GAMES.map((g, i) => h('a', {
        class: 'a-row',
        href: `#${g.id}`,
        style: { '--i': i },
        onclick: unlockAudio,
      },
      h('span', { class: 'a-no' }, KANJI[i]),
      h('span', { class: 'a-glyph', html: ART[g.id] }),
      h('span', { class: 'a-name' }, h('b', {}, g.title), h('em', {}, g.en)),
      h('span', { class: 'a-desc' }, g.desc),
      h('span', { class: 'a-tag label' }, g.tag)))),
    h('section', { class: 'a-settings' },
      h('h2', { class: 'label' }, 'Settings'),
      toggle('faceToFace', '向かい合わせ', 'テーブルをはさんで座るとき、上側の人の表示を逆さにします'),
      toggle('sound', '効果音', 'マナーモード中は鳴りません')));
  app.replaceChildren(screen);
}

function setView(name) {
  document.body.dataset.view = name;
  view.hidden = name === 'ko';
  bar.classList.toggle('is-gone', name === 'game');
  const tab = name === 'ko' ? 0 : 1;
  bar.style.setProperty('--tab', tab);
  bar.querySelectorAll('a').forEach((a, i) => {
    if (i === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  // ハイライトのぷにっとした伸び縮みをやり直す
  const pill = bar.querySelector('.tab-pill i');
  if (pill && bar.dataset.tab !== String(tab)) { pill.classList.remove('jelly'); void pill.offsetWidth; pill.classList.add('jelly'); }
  bar.dataset.tab = tab;
  window.dispatchEvent(new CustomEvent('ko:view', { detail: name }));
}

async function route() {
  closeAllOverlays();
  const id = location.hash.replace(/^#\/?/, '');
  const game = GAMES.find((g) => g.id === id);
  if (cleanup) { cleanup(); cleanup = null; }
  const my = ++routeId;

  if (game) {
    document.title = `${game.title} — ${BASE_TITLE}`;
    menuBuilt = false;
    setView('game');
    // 駒を撮り、盤の素材を用意してから開く (はじめての一回だけ少しかかる)
    app.replaceChildren(h('div', { class: 'a-loading', role: 'status' },
      h('span', { class: 'a-loading-line' }),
      h('span', { class: 'label' }, `${game.en} — 駒を並べています`)));
    await Promise.race([prepare(game.id), new Promise((r) => setTimeout(r, 20000))]);
    if (my !== routeId) return;
    const screen = h('div', { class: `screen game-${game.id}` });
    app.replaceChildren(screen);
    cleanup = game.mod.mount(screen) || null;
    return;
  }
  if (id === 'asobi') {
    document.title = `遊 — ${BASE_TITLE}`;
    if (!menuBuilt) { renderMenu(); menuBuilt = true; }
    setView('asobi');
    return;
  }
  document.title = BASE_TITLE;
  setView('ko');
}

window.addEventListener('hashchange', route);
// iOS でダブルタップやピンチによる拡大を防ぐ (遊のあいだだけ)
document.addEventListener('gesturestart', (e) => { if (document.body.dataset.view === 'game') e.preventDefault(); });
document.addEventListener('dblclick', (e) => { if (document.body.dataset.view === 'game') e.preventDefault(); }, { passive: false });
bar.addEventListener('click', (e) => { if (e.target.closest('a')) sfx('tap'); });
route();
