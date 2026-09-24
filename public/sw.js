const CACHE_NAME = 'presupuestos-pwa-v3';

// Lista de rutas y recursos que se descargarán para estar 100% disponibles OFFLINE:
// NOTA CLAVE: La ruta '/reportes-servidor' NO ESTÁ EN ESTA LISTA A PROPÓSITO.
const ASSETS_TO_CACHE = [
  '/',
  '/clientes',
  '/presupuestos/crear',
  '/offline-fallback',
  '/manifest.json',
  '/css/app.css',
  '/js/db.js?v=4',
  '/js/sync.js?v=4',
  '/js/app.js?v=4',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// 1. Instalación del Service Worker: Descarga automática de todas las páginas HTML y recursos
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Instalando versión v3 con pre-cache de múltiples páginas...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-cacheando páginas HTML del sitio...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activación y purga de cachés antiguas
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activando y limpiando cachés obsoletas...');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Eliminando caché antigua:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Intercepción inteligente de peticiones
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Las llamadas API (/api/*) y Livewire se dejan a la red (IndexedDB maneja la persistencia)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/livewire/')) {
    return;
  }

  // ESTRATEGIA DE NAVEGACIÓN MULTI-PÁGINA (Clic en enlaces HTML)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Si es la ruta /reportes-servidor, NO LA GUARDAMOS EN CACHÉ (es estrictamente solo online)
          if (url.pathname === '/reportes-servidor') {
            return networkResponse;
          }

          // Para las páginas permitidas, actualizamos la caché con la copia fresca del servidor
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          console.log('[ServiceWorker] Modo Offline: Interceptando navegación a:', url.pathname);

          // 1. Si la página solicitada está en caché (ej: '/', '/clientes', '/presupuestos/crear'), la entregamos de inmediato:
          const cachedPage = await caches.match(event.request);
          if (cachedPage) {
            return cachedPage;
          }

          // 2. Si la página NO ESTÁ en caché (ej: '/reportes-servidor'), entregamos la pantalla de fallback amigable:
          const fallback = await caches.match('/offline-fallback');
          if (fallback) {
            return fallback;
          }

          return caches.match('/');
        })
    );
    return;
  }

  // ESTRATEGIA PARA RECURSOS ESTÁTICOS (CSS, JS, Iconos): Cache First con revalidación
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});
