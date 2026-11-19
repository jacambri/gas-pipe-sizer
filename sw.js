/* Offline support: keep every app file on the device and serve it from there, even with no internet. */
const VERSION = '4b5ad74e22'; // replaced with a hash of the app files when it is published
const CACHE = 'gas-pipe-' + VERSION;
const FILES = ['./', './index.html', './styles.css', './manifest.webmanifest', './js/engine.js', './js/store.js',
  './js/draw.js', './js/ui.js', './js/list.js', './js/math.js', './js/main.js', './icons/icon-180.png', './icons/icon-192.png',
  './icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('gas-pipe-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).catch(() =>
      (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
