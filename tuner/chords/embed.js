// Shown inside the tuner app: a tick bezel behind the wheel (hidden by the current theme) and glow filters (see embed.css).
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(NS, 'svg');
  defs.setAttribute('aria-hidden', 'true');
  defs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  defs.innerHTML = `<defs><filter id="neon" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="w-glow" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  document.body.prepend(defs);

  // 60 ticks just outside the outer ring (wheel viewBox is -205..205, outer ring ends at r=198)
  const wrap = document.querySelector('.wheel-wrap');
  if (!wrap) return;
  const bezel = document.createElementNS(NS, 'svg');
  bezel.setAttribute('viewBox', '-205 -205 410 410');
  bezel.setAttribute('aria-hidden', 'true');
  bezel.classList.add('bezel');
  let h = '';
  for (let i = 0; i < 60; i++) {
    const a = i * 6 * Math.PI / 180, major = i % 5 === 0, r0 = major ? 199.5 : 201, r1 = 204.5;
    h += `<line x1="${(r0 * Math.sin(a)).toFixed(2)}" y1="${(-r0 * Math.cos(a)).toFixed(2)}" x2="${(r1 * Math.sin(a)).toFixed(2)}" y2="${(-r1 * Math.cos(a)).toFixed(2)}" class="${major ? 'mj' : ''}"/>`;
  }
  bezel.innerHTML = h;
  wrap.prepend(bezel);
})();
