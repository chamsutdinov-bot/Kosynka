// Офлайн-кэш «Косынки» и «Нард» (nardy/): страницы открываются из памяти телефона,
// новые версии скачиваются в фоне; открытая игра сама перезагружается (партия сохраняется).
const C = 'kosynka-v4';
const SCOPE = self.registration.scope;
const PAGES = [SCOPE, SCOPE + 'nardy/'];
const CORE = [...PAGES, SCOPE + 'apple-touch-icon.png'];
const FONTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// адрес страницы без ?… и без index.html
function pageKey(u) {
  const url = new URL(u);
  let p = url.origin + url.pathname.replace(/index\.html$/, '');
  if (!p.endsWith('/')) p += '/';
  return p;
}

async function refresh(key) {
  try {
    const c = await caches.open(C);
    const old = await c.match(key);
    const r = await fetch(key + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const text = await r.clone().text();
    const changed = old ? (await old.text()) !== text : false;
    await c.put(key, r);
    if (changed) (await self.clients.matchAll({ type: 'window' }))
      .filter(w => pageKey(w.url) === key).forEach(w => w.postMessage('updated'));
  } catch (e) {}
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('version.txt')) return;
  if (req.mode === 'navigate') {
    const key = pageKey(req.url);
    if (url.searchParams.has('v')) {
      e.respondWith(fetch(key + '?t=' + Date.now(), { cache: 'no-store' }).then(async r => {
        if (r.ok) (await caches.open(C)).put(key, r.clone());
        return r;
      }).catch(() => caches.match(key)));
      return;
    }
    e.respondWith(caches.open(C).then(async c => {
      const hit = await c.match(key);
      if (hit) { e.waitUntil(refresh(key)); return hit; }
      const r = await fetch(key); if (r.ok) c.put(key, r.clone()); return r;
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
