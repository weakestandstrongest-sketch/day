// Offline support. Pages and scripts are network-first (revalidated every time), so a new version shows up on the next open;
// the cached copy is used only when offline. Icons and Google Fonts are cache-first.
const CACHE = 'hibi-v226';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('hibi-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url), same = url.origin === location.origin, isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!same && !isFont) return;
  if (same && (req.mode === 'navigate' || /(\/|\.html|\.webmanifest|\.js)$/.test(url.pathname))) {
    // always ask GitHub Pages whether the page changed (it lets browsers keep a copy for 10 minutes otherwise)
    const fresh = req.mode === 'navigate' ? fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' });
    e.respondWith(fresh.then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./'))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
    return res;
  }));
});

// ---- notifications: the Worker sends an empty push at each time; the words come from what ひび手帳 left in IndexedDB ----
const ntDB = () => new Promise((ok, ng) => { const r = indexedDB.open('hibi-push', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
const ntGet = (db, k) => new Promise(r => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(undefined); });
const ntSet = (db, k, v) => new Promise(r => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = tx.onerror = tx.onabort = r; });
async function ntShow() {
  const now = Date.now();
  let db, plan = [], shown = [];
  try { db = await ntDB(); plan = (await ntGet(db, 'plan')) || []; shown = (await ntGet(db, 'shown')) || []; } catch (e) {}
  const seen = new Set(shown.map(x => x.id));
  // due now (a push can come a little early or late); not shown before
  const due = plan.filter(x => x.at <= now + 120000 && x.at >= now - 30 * 60000 && !seen.has(x.id));
  if (db) { try { await ntSet(db, 'shown', [...shown.filter(x => x.at > now - 2 * 86400000), ...due.map(x => ({ id: x.id, at: x.at }))]); } catch (e) {} db.close(); }
  // iOS wants a notice for every push: if nothing matches (the plan changed after the times were sent), say so plainly
  if (!due.length) return self.registration.showNotification('ひび手帳', { body: '今日の予定を確認しましょう', tag: 'hibi', data: { url: './' } });
  await Promise.all(due.map(x => self.registration.showNotification(x.title, { body: x.body, tag: x.id, data: { url: './' + (x.d ? '?d=' + x.d : '') } })));
}
self.addEventListener('push', e => { e.waitUntil(ntShow()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'hibi:open', url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
