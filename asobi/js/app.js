import { h, icon, settings, saveSettings, closeAllOverlays, unlockAudio, sfx } from './ui.js';
import { ART } from './art.js';
import * as yacht from './games/yacht.js';
import * as hitblow from './games/hitblow.js';
import * as gomoku from './games/gomoku.js';
import * as reversi from './games/reversi.js';
import * as chess from './games/chess.js';
import * as minishogi from './games/minishogi.js';
import * as airhockey from './games/airhockey.js';

export const GAMES = [
  { id: 'yacht', title: 'ヨット', desc: 'サイコロ5つで役をそろえる', tag: 'ダイス', mod: yacht },
  { id: 'hitblow', title: 'ヒット&ブロー', desc: '相手の色の並びを推理する', tag: '推理', mod: hitblow },
  { id: 'gomoku', title: '五目並べ', desc: '先に5つ並べたら勝ち', tag: '盤上', mod: gomoku },
  { id: 'reversi', title: 'リバーシ', desc: 'はさんでひっくり返す', tag: '盤上', mod: reversi },
  { id: 'chess', title: 'チェス', desc: 'キングを追い詰める', tag: '盤上', mod: chess },
  { id: 'minishogi', title: '5五将棋', desc: '5×5マスの小さな将棋', tag: '盤上', mod: minishogi },
  { id: 'airhockey', title: 'エアホッケー', desc: 'ふたり同時に操作するリアルタイム対戦', tag: 'アクション', mod: airhockey, wide: true },
];

const app = document.getElementById('app');
let cleanup = null;

function renderMenu() {
  document.title = 'あそび2人用';
  const toggle = (key, iconName, label, desc) => {
    const input = h('input', { type: 'checkbox', role: 'switch' });
    input.checked = settings[key];
    input.addEventListener('change', () => { settings[key] = input.checked; saveSettings(); sfx('tap'); });
    return h('label', { class: 'setting' },
      h('span', { class: 'setting-icon' }, icon(iconName)),
      h('span', { class: 'setting-text' }, h('strong', {}, label), h('small', {}, desc)),
      input);
  };
  const screen = h('div', { class: 'menu' },
    h('header', { class: 'hero' },
      h('p', { class: 'hero-kicker' }, 'TWO PLAYER GAMES'),
      h('h1', {}, 'あそび', h('span', { class: 'hero-badge' }, '2人用')),
      h('p', { class: 'hero-sub' }, 'iPhone 1台をはさんで、ふたりで遊ぶ7つのゲーム')),
    h('nav', { class: 'game-grid' },
      GAMES.map((g, i) => h('a', {
        class: `tile tile-${g.id} ${g.wide ? 'wide' : ''}`,
        href: `#/${g.id}`,
        style: { animationDelay: `${i * 40}ms` },
        onclick: unlockAudio,
      },
      h('span', { class: 'tile-art', html: ART[g.id] }),
      h('span', { class: 'tile-meta' },
        h('span', { class: 'tile-tag' }, g.tag),
        h('span', { class: 'tile-title' }, g.title),
        h('span', { class: 'tile-desc' }, g.desc))))),
    h('section', { class: 'settings' },
      h('h2', {}, '設定'),
      h('div', { class: 'setting-group' },
        toggle('faceToFace', 'people', '向かい合わせモード', 'テーブルをはさんで座るとき、上側の人の表示を逆さにします'),
        toggle('sound', 'sound', '効果音', 'マナーモード中は鳴りません'))),
    h('p', { class: 'hint' }, icon('share'), h('span', {}, 'Safari の共有ボタン →「ホーム画面に追加」で、全画面のアプリとして使えます')));
  app.append(screen);
}

function route() {
  closeAllOverlays();
  if (cleanup) { cleanup(); cleanup = null; }
  app.replaceChildren();
  const id = location.hash.replace(/^#\/?/, '');
  const game = GAMES.find((g) => g.id === id);
  if (!game) { renderMenu(); return; }
  document.title = `${game.title} - あそび2人用`;
  const screen = h('div', { class: `screen game-${game.id}` });
  app.append(screen);
  cleanup = game.mod.mount(screen) || null;
}

window.addEventListener('hashchange', route);
// iOS でダブルタップやピンチによる拡大を防ぐ
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
