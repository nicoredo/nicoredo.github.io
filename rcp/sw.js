const CACHE_NAME = 'medex-rcp-cache-v1';
const ASSETS_TO_CACHE = [
  '/rcp/',
  '/rcp/index.html',
  '/rcp/icono-rcp.png'
];

// Instala el Service Worker y guarda los archivos en la memoria caché
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activa el Service Worker y limpia cachés viejos si los hubiera
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Estrategia: Cache First (Busca primero en el disco local para que ande offline y vuele)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
