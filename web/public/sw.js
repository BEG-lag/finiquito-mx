// Offline support for the static calculator. Same-origin GET requests are
// served from the cache first and refreshed in the background, so the app
// keeps working without a connection after the first visit. VERSION and
// PRECACHE are filled in at build time (see vite.config.ts), so every
// release gets a fresh cache.
const VERSION = 'finiquito-mx-dev';
const SHELL = ['./', './index.html', './favicon.svg', './manifest.webmanifest'];
// Hashed JS, CSS and font files; filled in at build time by vite.config.ts.
const PRECACHE = [];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll([...SHELL, ...PRECACHE])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // Navigations with a query string (shared links) are served by the app shell.
  const key = request.mode === 'navigate' ? './index.html' : request;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(key, { ignoreSearch: request.mode === 'navigate' });
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request.mode === 'navigate' ? './index.html' : request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
