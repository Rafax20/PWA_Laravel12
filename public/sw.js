const CACHE_NAME = 'presupuestos-pwa-v1';

const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/css/app.css',
  '/js/db.js?v=2',
  '/js/sync.js?v=2',
  '/js/app.js?v=2',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Instalación del Service Worker y precacheo de recursos estáticos del App Shell
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Instalando nueva versión...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-cacheando recursos del App Shell');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activación y limpieza de cachés anteriores
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activando y limpiando cachés antiguas...');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Eliminando caché obsoleta:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de peticiones de red
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Las peticiones a la API y llamadas internas de Livewire se delegan a la red.
  // Su persistencia y gestión offline se realiza a nivel de aplicación con IndexedDB.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/livewire/')) {
    return;
  }

  // Estrategia para navegación (cuando el usuario entra o refresca la página):
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        console.log('[ServiceWorker] Sin conexión: Entregando App Shell desde caché');
        return caches.match('/');
      })
    );
    return;
  }

  // Estrategia Cache-First con actualización en segundo plano para recursos estáticos
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // En segundo plano intentamos actualizar la caché si hay red
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {
          // Sin conexión: no pasa nada, ya se entregó la versión en caché
        });
        return cachedResponse;
      }

      // Si no estaba en caché, pedirlo a la red
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
