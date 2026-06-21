const CACHE_NAME = 'medex-rcp-v2';
const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'icono-rcp.png'
];

// Instalación
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Usamos un loop para que si falla uno, no rompa la carga del resto
      return Promise.all(
        ASSETS_TO_CACHE.map(asset => {
          return cache.add(asset).catch(err => {
            console.error(`No se pudo cachear el recurso: ${asset}`, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
