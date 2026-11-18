// Shown inside the tuner app: quick controls that match the tuner/metronome screens.
// Everything here drives the page's own controls, so js/app.js keeps all of the logic.
(() => {
  const $ = id => document.getElementById(id);
  const settings = $('settings');
  const toSettings = () => {
    settings.scrollIntoView({ behavior: 'smooth', block: 'start' });
    settings.classList.remove('flash'); void settings.offsetWidth; settings.classList.add('flash');
  };

  // gear in the header opens the tuning settings
  const gear = document.createElement('button');
  gear.className = 'gear'; gear.setAttribute('aria-label', 'チューニング設定');
  gear.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
  gear.onclick = toSettings;
  // compact header like the metronome: small title on the left, pitch and gear on the right
  const mrow = document.querySelector('.mast-row');
  mrow.prepend(document.querySelector('.mast-title'));
  mrow.append(gear);

  // keyboard button beside the input
  const field = document.querySelector('#finder .field');
  const row = document.createElement('div'); row.className = 'field-row';
  field.before(row); row.append(field);
  const kb = document.createElement('button');
  kb.className = 'kb-btn'; kb.setAttribute('aria-label', '鍵盤で入力');
  kb.innerHTML = '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M7 5v8M12 5v8M17 5v8M7 13h0M2 13h20"/></svg>';
  const box = $('keyboard-box');
  const syncKb = () => kb.classList.toggle('on', box.open);
  kb.onclick = () => { box.open = !box.open; syncKb(); if (box.open) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  box.addEventListener('toggle', syncKb);
  row.append(kb);

  // quick chips: temperament and 0-cent reference cycle on tap, pitch opens the settings
  const quick = document.createElement('div'); quick.className = 'quick';
  row.after(quick);
  const label = b => b ? [...b.childNodes].map(n => n.textContent).join(' ').trim() : '';
  const chip = (seg, fmt) => {
    const c = document.createElement('button'); c.className = 'qchip';
    const paint = () => { c.innerHTML = fmt(label($(seg).querySelector('button.active'))); };
    c.onclick = () => {
      const bs = [...$(seg).querySelectorAll('button')], i = bs.findIndex(b => b.classList.contains('active'));
      bs[(i + 1) % bs.length].click();
    };
    new MutationObserver(paint).observe($(seg), { attributes: true, subtree: true, attributeFilter: ['class'] });
    paint(); quick.append(c);
  };
  chip('mode-seg', t => t + ' <i>▾</i>');
  chip('ref-seg', t => '0¢ = ' + t + ' <i>▾</i>');
  const pitch = document.createElement('button'); pitch.className = 'qchip';
  const paintPitch = () => { pitch.innerHTML = 'A4 <b>' + $('pill-a4').textContent + '</b> Hz'; };
  new MutationObserver(paintPitch).observe($('pill-a4'), { childList: true, characterData: true, subtree: true });
  paintPitch(); pitch.onclick = toSettings; quick.append(pitch);
})();

// shrink the chord name until it fits on one line
(() => {
  const name = document.getElementById('chord-name');
  const fit = () => {
    name.style.fontSize = '';
    const max = parseFloat(getComputedStyle(name).fontSize);
    let size = max;
    while (name.scrollWidth > name.clientWidth && size > 24) { size -= 2; name.style.fontSize = size + 'px'; }
  };
  new MutationObserver(fit).observe(name, { childList: true, characterData: true, subtree: true });
  window.addEventListener('resize', fit);
  if (document.fonts) document.fonts.ready.then(fit);
  fit();
})();
