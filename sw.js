/* NBFC Brief (public edition) service worker. Every cache name starts with 'nbfc-brief-', and activate
   deletes only its own old shells, so it can never touch another app's caches.
   Shell: precached, stale-while-revalidate (a new deploy shows on the next open).
   Data (data.js, data/*.json, days/*): network-first; if a saved copy exists and the network takes
   over 3 s (or is down), the saved copy is shown and the app offers "New edition available — Refresh". Fonts: cache-first.
   search.js, hubs.js and cu.js are precached with the shell (it is only executed when Search opens); the search index itself lives in IndexedDB. */
const NS = 'nbfc-brief-';
const VERSION = 'v14-2026-11-13-cardtap';
const SHELL = `${NS}shell-${VERSION}`;
const DATA = `${NS}data-v1`;
const FONTS = `${NS}fonts-v1`;
const SHELL_FILES = ['/', '/index.html', '/app.css', '/app.js', '/cu.js', '/search.js', '/hubs.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/favicon-64.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(`${NS}shell-`) && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isData = p => p === '/data.js' || p.startsWith('/data/') || p.startsWith('/days/');

// Network-first. If we already hold a copy and the network is slower than `wait` ms, show the copy
// now; the fetch keeps going, refreshes the cache, and the page's update check offers a Refresh.
async function networkFirst(req, cacheName, key, wait = 0, ev) {
  const cache = await caches.open(cacheName);
  const net = fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) return cache.put(key || req, res.clone()).then(() => res, () => res);
    return res;
  });
  const hit = await cache.match(key || req, { ignoreSearch: true });
  if (hit && wait) {
    if (ev) ev.waitUntil(net.catch(() => {}));
    const slow = new Promise(r => setTimeout(() => r(null), wait));
    const first = await Promise.race([net.catch(() => null), slow]);
    return first && first.ok ? first : hit;
  }
  try { return await net; } catch (err) { if (hit) return hit; throw err; }
}
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return; // update probes read data.js directly
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, FONTS)); return;
  }
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // the app is one page; always try fresh HTML, fall back to the cached shell
    e.respondWith(networkFirst(req, SHELL, '/index.html').catch(() => caches.match('/index.html')));
    return;
  }
  if (isData(url.pathname)) { e.respondWith(networkFirst(req, DATA, url.pathname, 3000, e)); return; }
  // shell assets: stale-while-revalidate, so a new deploy shows up on the next open
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(res => { if (res.ok) cache.put(url.pathname, res.clone()); return res; });
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    return fresh;
  })());
});
