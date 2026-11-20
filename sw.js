// Офлайн-кэш «Косынки»: страница открывается сразу из памяти телефона,
// новая версия скачивается в фоне, и открытая игра сама перезагружается (партия сохраняется).
const C = 'kosynka-v3';
const SCOPE = self.registration.scope;
const PAGE = SCOPE;
const CORE = [SCOPE, SCOPE + 'index.html', SCOPE + 'apple-touch-icon.png'];
const FONTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function refreshPage() {
  try {
    const c = await caches.open(C);
    const old = await c.match(PAGE);
    const r = await fetch(PAGE + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const text = await r.clone().text();
    const changed = old ? (await old.text()) !== text : false;
    await c.put(PAGE, r.clone()); await c.put(SCOPE + 'index.html', r);
    if (changed) (await self.clients.matchAll({ type: 'window' })).forEach(w => w.postMessage('updated'));
  } catch (e) {}
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('version.txt')) return;
  if (req.mode === 'navigate' && url.searchParams.has('v')) {
    e.respondWith(fetch(SCOPE + '?t=' + Date.now(), { cache: 'no-store' }).then(async r => {
      if (r.ok) { const c = await caches.open(C); await c.put(PAGE, r.clone()); await c.put(SCOPE + 'index.html', r.clone()); }
      return r;
    }).catch(() => caches.match(PAGE)));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(C).then(async c => {
      const hit = await c.match(PAGE) || await c.match(SCOPE + 'index.html');
      if (hit) { e.waitUntil(refreshPage()); return hit; }
      const r = await fetch(req); if (r.ok) c.put(PAGE, r.clone()); return r;
    }));
    return;
  }
  if (url.origin === location.origin || FONTS.includes(url.hostname)) {
    e.respondWith(caches.open(C).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
