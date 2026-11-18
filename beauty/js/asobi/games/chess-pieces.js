// チェスの駒 (オリジナルの SVG)。viewBox は 0 0 100 100、底辺は y = 90。
// body は駒の形、detail は色を反転させて描く線 (目・切れ込みなど)。

const BASE = 'M22 90 a4 4 0 0 1-4-4 v-2 a4 4 0 0 1 4-4 H78 a4 4 0 0 1 4 4 v2 a4 4 0 0 1-4 4 Z';
const COLLAR = (y, half) => `M${50 - half} ${y} h${half * 2} a3 3 0 0 1 0 6 h-${half * 2} a3 3 0 0 1 0-6 Z`;

export const PIECES = {
  p: {
    body: [
      BASE,
      'M33 80 C36 68 41 60 43 52 H57 C59 60 64 68 67 80 Z',
      COLLAR(46, 13),
      'M50 18 a13 13 0 1 1 0 26 a13 13 0 1 1 0-26 Z',
    ],
    detail: [],
  },
  r: {
    body: [
      BASE,
      'M31 80 L35 44 H65 L69 80 Z',
      COLLAR(38, 19),
      'M27 18 H37 V25 H45 V18 H55 V25 H63 V18 H73 V38 H27 Z',
    ],
    detail: ['M35 50 H65', 'M33 70 H67'],
  },
  n: {
    body: [
      BASE,
      'M68 80 H32 C32 66 38 58 49 51 C42 52 36 55 30 58 C24 61 17 57 18 50 C19 44 27 36 33 30 C36 24 38 17 42 11 L47 19 C51 16 55 15 58 16 C72 22 80 38 78 56 C77 66 72 73 68 80 Z',
    ],
    detail: ['M37 31 a2.6 2.6 0 1 0 0.1 0', 'M23 50 a1.6 1.6 0 1 0 0.1 0', 'M58 22 C68 30 72 44 70 60'],
  },
  b: {
    body: [
      BASE,
      'M36 80 C39 68 43 60 44 54 H56 C57 60 61 68 64 80 Z',
      COLLAR(48, 15),
      'M50 13 C40 22 33 34 38 47 H62 C67 34 60 22 50 13 Z',
      'M50 3 a5 5 0 1 1 0 10 a5 5 0 1 1 0-10 Z',
    ],
    detail: ['M54 23 L45 35'],
  },
  q: {
    body: [
      BASE,
      'M34 80 L38 60 H62 L66 80 Z',
      COLLAR(56, 17),
      'M22 26 L33 56 H67 L78 26 L63 44 L58 18 L50 42 L42 18 L37 44 Z',
      ...[[22, 22], [41, 14], [59, 14], [78, 22]].map(([x, y]) => `M${x} ${y - 5} a5 5 0 1 1 0 10 a5 5 0 1 1 0-10 Z`),
      'M50 31 a5 5 0 1 1 0 10 a5 5 0 1 1 0-10 Z',
    ],
    detail: [],
  },
  k: {
    body: [
      BASE,
      'M35 80 L38 60 H62 L65 80 Z',
      COLLAR(54, 17),
      'M50 31 C42 22 26 22 27 35 C28 44 34 50 37 54 H63 C66 50 72 44 73 35 C74 22 58 22 50 31 Z',
      'M46 4 H54 V12 H62 V19 H54 V30 H46 V19 H38 V12 H46 Z',
    ],
    detail: [],
  },
};

export function pieceSVG(type, color, extraClass = '') {
  const def = PIECES[type];
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', `cp ${color} ${extraClass}`);
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'cp-body');
  for (const d of def.body) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    g.append(p);
  }
  svg.append(g);
  if (def.detail.length) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', def.detail.join(' '));
    p.setAttribute('class', 'cp-detail');
    svg.append(p);
  }
  return svg;
}
