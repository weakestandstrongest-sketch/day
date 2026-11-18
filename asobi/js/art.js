// メニューのゲームカードに使うイラスト (SVG 文字列)
import { PIECES } from './games/chess-pieces.js';

const VB = 'viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice"';
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };

function die(x, y, rot, size, face) {
  const s = size / 2, d = size * 0.27;
  const pips = PIPS[face].map(([px, py]) => `<circle cx="${px * d}" cy="${py * d}" r="${size * (face === 1 ? 0.12 : 0.085)}" fill="${face === 1 ? '#d62f3a' : '#26201b'}"/>`).join('');
  return `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="${-s + 3}" y="${-s + 6}" width="${size}" height="${size}" rx="${size * 0.22}" fill="#000" opacity=".28"/>
    <rect x="${-s}" y="${-s}" width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#ya-die)"/>
    <rect x="${-s + 1}" y="${-s + 1}" width="${size - 2}" height="${size - 2}" rx="${size * 0.2}" fill="none" stroke="#fff" stroke-opacity=".7"/>
    ${pips}</g>`;
}

// 光沢のある丸 (石・宝石)
function gem(x, y, r, color, dark) {
  return `<circle cx="${x + r * 0.15}" cy="${y + r * 0.3}" r="${r}" fill="#000" opacity=".3"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${dark}" stroke-width="${r * 0.18}" opacity=".6"/>
    <ellipse cx="${x - r * 0.32}" cy="${y - r * 0.38}" rx="${r * 0.38}" ry="${r * 0.24}" fill="#fff" opacity=".75" transform="rotate(-30 ${x - r * 0.32} ${y - r * 0.38})"/>`;
}

const blackStone = (x, y, r) => gem(x, y, r, '#1c1c1c', '#000');
const whiteStone = (x, y, r) => gem(x, y, r, '#f4f2ec', '#a9a49a');

function grid(x0, y0, step, nx, ny, color, width) {
  let d = '';
  for (let i = 0; i <= nx; i++) d += `M${x0 + i * step} ${y0}v${ny * step}`;
  for (let j = 0; j <= ny; j++) d += `M${x0} ${y0 + j * step}h${nx * step}`;
  return `<path d="${d}" stroke="${color}" stroke-width="${width}" fill="none"/>`;
}

function chessPiece(type, color, x, y, size) {
  const k = size / 100;
  const fill = color === 'w' ? '#f8f3e8' : '#24211e';
  const stroke = color === 'w' ? '#2b2420' : '#000';
  return `<g transform="translate(${x} ${y}) scale(${k})" fill="${fill}" stroke="${stroke}" stroke-width="3.4" stroke-linejoin="round">
    ${PIECES[type].body.map((d) => `<path d="${d}"/>`).join('')}
    ${PIECES[type].detail.length ? `<path d="${PIECES[type].detail.join(' ')}" fill="none" stroke="${color === 'w' ? '#2b2420' : '#d9d2c3'}" stroke-linecap="round"/>` : ''}</g>`;
}

function koma(x, y, rot, size, label, red = false) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${size / 100})">
    <path d="M4 10 L-50 -50" opacity="0"/>
    <path d="M0 -52 L33 -40 L46 52 H-46 L-33 -40 Z" fill="#000" opacity=".3" transform="translate(4 6)"/>
    <path d="M0 -52 L33 -40 L46 52 H-46 L-33 -40 Z" fill="url(#sh-koma)" stroke="#8d6633" stroke-width="3" stroke-linejoin="round"/>
    <text x="0" y="16" text-anchor="middle" font-size="46" font-weight="700" fill="${red ? '#b3261e' : '#1d140b'}"
      font-family="Hiragino Mincho ProN, Yu Mincho, Noto Serif JP, serif">${label}</text></g>`;
}

export const ART = {
  yacht: `<svg ${VB}><defs>
      <radialGradient id="ya-bg" cx=".5" cy=".35" r=".85"><stop offset="0" stop-color="#2f7a5c"/><stop offset="1" stop-color="#0d3326"/></radialGradient>
      <linearGradient id="ya-die" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e1d8c6"/></linearGradient></defs>
    <rect width="160" height="100" fill="url(#ya-bg)"/>
    ${die(50, 56, -16, 40, 5)}${die(104, 44, 14, 36, 1)}${die(128, 78, -6, 22, 3)}</svg>`,

  hitblow: `<svg ${VB}><defs>
      <linearGradient id="hb-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3482"/><stop offset="1" stop-color="#15123a"/></linearGradient></defs>
    <rect width="160" height="100" fill="url(#hb-bg)"/>
    <rect x="14" y="18" width="132" height="30" rx="15" fill="#0b0a20" opacity=".45"/>
    <rect x="14" y="54" width="132" height="30" rx="15" fill="#0b0a20" opacity=".55"/>
    ${[['#ef5350', '#8e1c1a'], ['#42a5f5', '#0d4f8b'], ['#66bb6a', '#1f6b25'], ['#ffca28', '#a2700a']].map(([c, d], i) => gem(34 + i * 22, 33, 9, c, d)).join('')}
    ${[['#ffca28', '#a2700a'], ['#ab47bc', '#5b1769'], ['#42a5f5', '#0d4f8b'], ['#ef5350', '#8e1c1a']].map(([c, d], i) => gem(34 + i * 22, 69, 9, c, d)).join('')}
    ${[[126, 28, '#ff4d4d'], [134, 28, '#ff4d4d'], [126, 38, '#f5f5f5'], [134, 38, '#3a3760']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="3" fill="${c}"/>`).join('')}
    ${[[126, 64, '#f5f5f5'], [134, 64, '#f5f5f5'], [126, 74, '#3a3760'], [134, 74, '#3a3760']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="3" fill="${c}"/>`).join('')}</svg>`,

  gomoku: `<svg ${VB}><defs>
      <linearGradient id="gm-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0cc88"/><stop offset="1" stop-color="#c58d42"/></linearGradient></defs>
    <rect width="160" height="100" fill="url(#gm-bg)"/>
    ${grid(-4, -6, 14, 12, 8, '#6b4718', 0.8)}
    ${[[38, 22], [52, 36], [66, 50], [80, 64]].map(([x, y]) => blackStone(x, y, 6.2)).join('')}
    ${[[94, 78]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6.2" fill="#1c1c1c" opacity=".35"/>`).join('')}
    ${[[80, 36], [94, 50], [52, 64], [108, 36]].map(([x, y]) => whiteStone(x, y, 6.2)).join('')}</svg>`,

  reversi: `<svg ${VB}><defs>
      <radialGradient id="rv-bg" cx=".5" cy=".45" r=".8"><stop offset="0" stop-color="#36a06a"/><stop offset="1" stop-color="#11502f"/></radialGradient></defs>
    <rect width="160" height="100" fill="url(#rv-bg)"/>
    ${grid(10, -10, 24, 6, 5, 'rgba(0,0,0,.35)', 1)}
    ${blackStone(70, 38, 10)}${whiteStone(94, 38, 10)}${whiteStone(70, 62, 10)}${blackStone(94, 62, 10)}
    <g transform="translate(118 62)"><ellipse cx="2" cy="4" rx="4" ry="10" fill="#000" opacity=".3"/>
      <ellipse cx="0" cy="0" rx="4" ry="10" fill="#1c1c1c"/><path d="M0 -10 A4 10 0 0 1 0 10 Z" fill="#f4f2ec"/></g>
    ${blackStone(118, 38, 10)}</svg>`,

  chess: `<svg ${VB}><defs>
      <linearGradient id="ch-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b4a30"/><stop offset="1" stop-color="#2a1a0f"/></linearGradient></defs>
    <rect width="160" height="100" fill="url(#ch-bg)"/>
    <g opacity=".22">${Array.from({ length: 40 }, (_, i) => ((i % 8) + Math.floor(i / 8)) % 2 ? `<rect x="${(i % 8) * 20}" y="${Math.floor(i / 8) * 20}" width="20" height="20" fill="#f0d9b5"/>` : '').join('')}</g>
    ${chessPiece('k', 'b', 74, 6, 66)}${chessPiece('n', 'w', 34, 14, 76)}${chessPiece('p', 'w', 108, 42, 44)}</svg>`,

  minishogi: `<svg ${VB}><defs>
      <linearGradient id="sh-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ebc47e"/><stop offset="1" stop-color="#b98238"/></linearGradient>
      <linearGradient id="sh-koma" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#fdf0cf"/><stop offset="1" stop-color="#e2b46c"/></linearGradient></defs>
    <rect width="160" height="100" fill="url(#sh-bg)"/>
    ${grid(-6, -8, 26, 7, 5, 'rgba(60,35,10,.55)', 0.9)}
    ${koma(62, 52, -8, 66, '玉')}${koma(112, 58, 10, 46, 'と', true)}</svg>`,

  airhockey: `<svg ${VB}><defs>
      <radialGradient id="ah-bg" cx=".5" cy=".5" r=".8"><stop offset="0" stop-color="#12406a"/><stop offset="1" stop-color="#051326"/></radialGradient>
      <radialGradient id="ah-m1" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#ff8070"/><stop offset="1" stop-color="#6e2018"/></radialGradient>
      <radialGradient id="ah-m2" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#63c7ff"/><stop offset="1" stop-color="#14506e"/></radialGradient>
      <radialGradient id="ah-p" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff7cf"/><stop offset=".5" stop-color="#ffd84d"/><stop offset="1" stop-color="#b8860b"/></radialGradient>
      <filter id="ah-glow"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
    <rect width="160" height="100" fill="url(#ah-bg)"/>
    <path d="M80 0V100" stroke="rgba(255,255,255,.25)"/><circle cx="80" cy="50" r="16" fill="none" stroke="rgba(255,255,255,.25)"/>
    <path d="M0 30V70" stroke="#ff8070" stroke-width="4" filter="url(#ah-glow)"/><path d="M160 30V70" stroke="#63c7ff" stroke-width="4" filter="url(#ah-glow)"/>
    ${[0.15, 0.3, 0.45, 0.6].map((a, i) => `<circle cx="${70 + i * 9}" cy="${66 - i * 6}" r="${3 + i}" fill="#ffd84d" opacity="${a}"/>`).join('')}
    <circle cx="108" cy="42" r="7" fill="url(#ah-p)"/>
    <circle cx="40" cy="58" r="15" fill="url(#ah-m1)"/><circle cx="40" cy="58" r="6.5" fill="url(#ah-m1)" stroke="rgba(0,0,0,.25)"/>
    <circle cx="132" cy="36" r="15" fill="url(#ah-m2)"/><circle cx="132" cy="36" r="6.5" fill="url(#ah-m2)" stroke="rgba(0,0,0,.25)"/></svg>`,
};
