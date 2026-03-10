const CACHE_NAME = 'visionalert-cache-v20';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './config.js.example',
  './favicon.ico',
  './logo192.png',
  './logo512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // [EN] Using Settled to prevent failure if icon files are missing initially
      // [ES] Usando Settled para evitar fallos si faltan los archivos de iconos al inicio
      const promises = ASSETS_TO_CACHE.map(asset =>
        cache.add(asset).catch(e => console.warn('Cache add failed for:', asset, e))
      );
      return Promise.allSettled(promises);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  // [EN] Network-First for main logic files during dev/debug, Cache-First for others
  // [ES] Primero Red para archivos de lógica principal durante dev/debug, Primero Caché para los demás
  const isLogicFile = event.request.url.includes('app.js') || event.request.url.includes('index.html');

  if (isLogicFile) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      }).catch(() => caches.match(event.request))
    );
  } else {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
  }
});
