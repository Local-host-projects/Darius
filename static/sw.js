// Darius service worker — app shell cache-first, API always networked.
const CACHE = 'darius-shell-v5';
const SHELL = [
  '/',
  '/static/css/styles.css',
  '/static/js/api.js',
  '/static/js/icons.js',
  '/static/js/ui.js',
  '/static/js/app.js',
  '/static/js/workspace.js',
  '/static/js/chat.js',
  '/manifest.webmanifest',
  '/icons/logo.svg',
  '/icons/favicon-64.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;                          // POSTs go straight to network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/docs')) return;
  if (url.pathname.startsWith('/icons/')) {
    e.respondWith(cacheFirst(e.request));
    return;
  }
  if (e.request.mode === 'navigate') {
    e.respondWith(networkFirst(e.request));
    return;
  }
  e.respondWith(cacheFirst(e.request));
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && (url0(req).origin === location.origin)) {
      const c = await caches.open(CACHE);
      c.put(req, res.clone());
    }
    return res;
  } catch {
    return new Response('offline', { status: 503 });
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    return res;
  } catch {
    const hit = await caches.match('/') || await caches.match(req);
    if (hit) return hit;
    return new Response('<h1>You are offline</h1>', { headers: { 'Content-Type': 'text/html' } });
  }
}

function url0(req) { try { return new URL(req.url); } catch { return location; } }
