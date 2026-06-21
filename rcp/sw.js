const CACHE_NAME = 'medex-rcp-v2';
const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'icono-rcp.png'
];



(function() {
    // Definimos dónde está permitido que corra la app
    const allowedDomains = ['medex.ar', 'www.medex.ar', 'localhost', '127.0.0.1'];
    const currentHost = window.location.hostname;

    if (!allowedDomains.includes(currentHost)) {
        // Si no está en tu dominio, borramos toda la interfaz y mostramos un error
        document.body.innerHTML = `<div style="text-align:center; margin-top:20%; font-family:sans-serif;">
            <h2>⚠️ Error de Licencia</h2>
            <p>Esta herramienta es propiedad exclusiva y solo puede ejecutarse desde su sitio oficial.</p>
        </div>`;
        
        // Opcional: Redirigir al infractor a tu web original
        // window.location.href = "https://medex.ar/rcp";
        
        throw new Error("Ejecución no autorizada bloqueada.");
    }
})();

// Bloquear el clic derecho
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

// Bloquear atajos de teclado típicos de desarrolladores (F12, Ctrl+Shift+I, Ctrl+U)
document.addEventListener('keydown', function(e) {
    if (e.key === 'F12' || 
       (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'C' || e.key === 'J')) ||
       (e.ctrlKey && e.key === 'U')) {
        e.preventDefault();
    }
});

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
