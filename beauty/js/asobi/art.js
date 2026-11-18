// メニューの図案。線は文字色、ひとところだけ節気の色 (class="a")
const svg = (body) => `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2">${body}</svg>`;
const dot = (x, y, r, cls = '') => `<circle cx="${x}" cy="${y}" r="${r}" class="${cls || 'f'}"/>`;

export const ART = {
  yacht: svg(`<rect x="15" y="15" width="34" height="34"/>
    ${dot(23, 23, 2.6)}${dot(41, 23, 2.6)}${dot(32, 32, 3, 'a')}${dot(23, 41, 2.6)}${dot(41, 41, 2.6)}`),
  hitblow: svg(`${[14, 26, 38, 50].map((x, i) => `<circle cx="${x}" cy="26" r="5" class="${i % 2 ? '' : 'f'}"/>`).join('')}
    ${dot(28, 44, 2.4, 'a')}${dot(36, 44, 2.4)}<circle cx="28" cy="52" r="2.4"/><circle cx="36" cy="52" r="2.4"/>`),
  gomoku: svg(`${[12, 22, 32, 42, 52].map((v) => `<path d="M${v} 10V54M10 ${v}H54"/>`).join('')}
    ${[[12, 52], [22, 42], [32, 32], [42, 22]].map(([x, y]) => dot(x, y, 3.6)).join('')}${dot(52, 12, 3.6, 'a')}`),
  reversi: svg(`<circle cx="32" cy="32" r="17"/><path d="M32 15a17 17 0 0 0 0 34z" class="f"/>${dot(46, 46, 2.4, 'a')}`),
  chess: svg(`<circle cx="32" cy="19" r="6"/><path d="M28 25h8M29 25q-1 12-6 21h18q-5-9-6-21"/><path d="M19 50h26" class="a"/>`),
  minishogi: svg(`<path d="M32 10l12 6 4 38H16l4-38z"/><text x="32" y="42" text-anchor="middle" font-size="17" stroke="none" fill="currentColor" font-family="Zen Old Mincho, serif">王</text>${dot(32, 50, 1.6, 'a')}`),
  airhockey: svg(`<rect x="17" y="9" width="30" height="46"/><path d="M17 32h30M27 9h10M27 55h10"/><circle cx="32" cy="45" r="5"/>${dot(36, 24, 2.6, 'a')}`),
  darts: svg(`<circle cx="30" cy="34" r="20"/><circle cx="30" cy="34" r="13" class="a s"/><circle cx="30" cy="34" r="6"/>${dot(30, 34, 1.8, 'a')}<path d="M31 33l19-19M46 12l4 2 2 4"/>`),
};
