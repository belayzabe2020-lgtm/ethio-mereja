// Ethio Mereja service worker: after the first online visit the whole app (page, Tailwind, icons, fonts) works offline.
const VERSION = 'v2';
const SHELL = 'shell-' + VERSION;
const LIBS = 'libs-' + VERSION;
const PRECACHE = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
// Third-party files the page needs. They are saved while the worker installs, so the very first visit is enough.
const LIB_URLS = [
  'https://cdn.tailwindcss.com/3.4.17',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+Ethiopic:wght@300;400;500;600;700;800&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL).then(c => c.addAll(PRECACHE))
      .then(() => precacheLibs(LIB_URLS).catch(() => {}))     // a slow or blocked CDN must never stop the install
      .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== LIBS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const okToStore = r => r && (r.ok || r.type === 'opaque');

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (okToStore(res)) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') { const page = await cache.match('./'); if (page) return page; }
    throw err;
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(LIBS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (okToStore(res)) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;          // never cache the database / login traffic
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req, SHELL)); return; }   // our own files: newest when online
  e.respondWith(cacheFirst(req));                              // Tailwind, icons, fonts: kept after first load
});

// The page lists the third-party files it uses; fetch them (and the fonts named inside the CSS) right away,
// so even the very first visit is fully available offline afterwards.
async function fetchBoth(url) {
  try { const r = await fetch(url, { mode: 'cors' }); if (okToStore(r)) return r; } catch (_) {}
  return fetch(url, { mode: 'no-cors' });
}
async function precacheLibs(urls) {
  const cache = await caches.open(LIBS);
  for (const url of urls || []) {
    try {
      if (await cache.match(url)) continue;
      const res = await fetchBoth(url);
      if (!okToStore(res)) continue;
      await cache.put(url, res.clone());
      if (/\.css(\?|$)|fonts\.googleapis\.com/.test(url) && res.type !== 'opaque') {
        const text = await res.clone().text();
        const refs = [...text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map(m => m[1]).filter(u => /\.woff2(\?|#|$)/.test(u));
        for (const ref of new Set(refs)) {
          const abs = new URL(ref, url).href;
          try { if (!(await cache.match(abs))) { const fr = await fetchBoth(abs); if (okToStore(fr)) await cache.put(abs, fr); } } catch (_) {}
        }
      }
    } catch (_) {}
  }
}
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'precache') e.waitUntil(precacheLibs(e.data.urls));
});
