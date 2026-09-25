/**
 * ==============================================================================
 * SERVICE WORKER PWA (public/sw.js)
 * ==============================================================================
 * 
 * ¿QUÉ ES ESTE ARCHIVO Y CÓMO FUNCIONA?
 * ------------------------------------------------------------------------------
 * Este script se ejecuta en un hilo secundario del navegador (fuera del hilo principal de la UI).
 * Actúa como un proxy o intermediario de red programable:
 * 1. Puede interceptar cada petición HTTP que hace la aplicación (fetch).
 * 2. Puede almacenar en el "Cache Storage" del navegador páginas HTML enteras, CSS, JS e imágenes.
 * 3. Permite que la aplicación web funcione 100% OFFLINE (sin conexión a internet).
 * 4. Habilita la capacidad de instalar la aplicación en Windows, Mac, Android e iOS.
 * ==============================================================================
 */

// 1. NOMBRE DE LA CACHÉ
// REGLA DE ORO EN PRODUCCIÓN: Si actualizas estilos CSS, vistas Blade o JS, incrementa esta versión
// (ej. 'presupuestos-pwa-v9'). Eso forzará al navegador a descargar los nuevos archivos y purgar los viejos.
const CACHE_NAME = 'presupuestos-pwa-v8';

// 2. LISTA DE RECURSOS PRE-CACHEADOS (Descarga inicial obligatoria)
// Todos estos recursos se descargarán y guardarán en el almacenamiento local del dispositivo
// la primera vez que el usuario visite la aplicación.
const ASSETS_TO_CACHE = [
  '/',                     // Vista principal (dashboard / productos)
  '/presupuestos',         // Vista del historial de presupuestos offline
  '/clientes',             // Vista de listado de clientes
  '/presupuestos/crear',   // Formulario de creación de presupuestos offline
  '/offline-fallback',     // Página de respaldo cuando se intenta entrar a una ruta no cacheada sin internet
  '/manifest.json',        // Manifiesto de la PWA (identidad, iconos, tema)
  '/css/app.css',          // Estilos visuales de la aplicación
  '/js/db.js?v=8',         // Motor IndexedDB local del cliente
  '/js/sync.js?v=8',       // Motor de sincronización, colas e idempotencia
  '/js/app.js?v=8',        // Lógica de interfaz de usuario
  '/icons/icon.svg',       // Icono vectorial
  '/icons/icon-192.png',   // Icono estándar (192x192 px)
  '/icons/icon-512.png'    // Icono de alta resolución (512x512 px)
];

/**
 * ==============================================================================
 * 1. EVENTO 'install' (Instalación del Service Worker)
 * ==============================================================================
 * ¿Cuándo ocurre?: La primera vez que el navegador detecta este archivo o cuando cambia CACHE_NAME.
 * ¿Qué hace?: Abre el almacén de caché local y descarga en paralelo todos los ASSETS_TO_CACHE.
 */
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Instalando nueva versión con pre-cache de páginas y assets...');
  
  // event.waitUntil() le indica al navegador que la instalación no termina hasta que la promesa se resuelva.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Guardando recursos esenciales en Cache Storage:', CACHE_NAME);
        // cache.addAll() realiza un fetch por cada ruta y almacena el Request y el Response en disco
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        // self.skipWaiting() obliga al Service Worker recién instalado a activarse inmediatamente,
        // sin esperar a que el usuario cierre todas las pestañas abiertas.
        return self.skipWaiting();
      })
  );
});

/**
 * ==============================================================================
 * 2. EVENTO 'activate' (Activación y Limpieza)
 * ==============================================================================
 * ¿Cuándo ocurre?: Cuando el nuevo Service Worker toma el control.
 * ¿Qué hace?: Elimina cachés viejas (versiones anteriores) para no consumir espacio en disco.
 */
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activando Service Worker y limpiando versiones anteriores...');
  
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          // Si existe una caché en el navegador cuyo nombre sea diferente a CACHE_NAME actual, la borramos
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Eliminando caché obsoleta:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      // self.clients.claim() hace que el Service Worker tome el control de todas las páginas abiertas de inmediato
      return self.clients.claim();
    })
  );
});

/**
 * ==============================================================================
 * 3. EVENTO 'fetch' (Interceptor de Peticiones de Red)
 * ==============================================================================
 * ¿Cuándo ocurre?: CADA VEZ que la aplicación web solicita un recurso (HTML, CSS, JS, imágenes, API).
 * ¿Qué hace?: Analiza la URL y decide si enviar la petición al SERVIDOR EN INTERNET o a la CACHÉ LOCAL.
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ----------------------------------------------------------------------------
  // EXCLUSIÓN 1: Rutas de API (/api/*) y componentes Livewire (/livewire/*)
  // ----------------------------------------------------------------------------
  // ¿POR QUÉ?: Las llamadas a /api/sync/* o /api/products manejan datos dinámicos.
  // La persistencia de datos offline la gestiona IndexedDB (db.js), no la caché del Service Worker.
  // Dejamos que estas peticiones salgan directo a la red.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/livewire/')) {
    return;
  }

  // ----------------------------------------------------------------------------
  // EXCLUSIÓN 2: Peticiones no idempotentes (POST, PUT, DELETE)
  // ----------------------------------------------------------------------------
  // Cache Storage solo admite almacenar peticiones de lectura HTTP GET.
  if (event.request.method !== 'GET') {
    return;
  }

  // ----------------------------------------------------------------------------
  // ESTRATEGIA A: NAVEGACIÓN MULTI-PÁGINA (Clics en enlaces HTML / Cambios de URL)
  // Estrategia: "Network First con Fallback a Caché"
  // 1. Intenta obtener el HTML fresco desde el servidor Laravel.
  // 2. Si hay internet: Devuelve la página y actualiza la copia en caché en segundo plano.
  // 3. Si NO hay internet (offline): Devuelve la página guardada en caché.
  // 4. Si la página nunca se visitó y no hay red: Muestra la vista '/offline-fallback'.
  // ----------------------------------------------------------------------------
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Demostración: La ruta '/reportes-servidor' se excluye deliberadamente de la caché
          // para simular páginas que estrictamente requieren conexión en tiempo real.
          if (url.pathname === '/reportes-servidor') {
            return networkResponse;
          }

          // Para todas las demás páginas HTML válidas (HTTP 200), guardamos una copia fresca en caché
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          console.warn('[ServiceWorker] Sin conexión a internet. Buscando página en caché local:', url.pathname);

          // 1. Buscamos si la página específica solicitada ya está guardada en la caché local:
          // ignoreSearch: true permite que rutas como '/?device=A' coincidan con '/'
          const cachedPage = await caches.match(event.request, { ignoreSearch: true });
          if (cachedPage) {
            return cachedPage;
          }

          // 2. Si el usuario intenta entrar a una página no cacheada sin internet (ej: /reportes-servidor),
          // entregamos la pantalla de cortesía /offline-fallback:
          const fallbackPage = await caches.match('/offline-fallback');
          if (fallbackPage) {
            return fallbackPage;
          }

          // 3. Último recurso: entregar la raíz
          return caches.match('/');
        })
    );
    return;
  }

  // ----------------------------------------------------------------------------
  // ESTRATEGIA B: RECURSOS ESTÁTICOS (CSS, JavaScript, Iconos, Fuentes, Imágenes)
  // Estrategia: "Stale-While-Revalidate" (Caché primero para velocidad instantánea + actualización en fondo)
  // 1. Si el archivo está en caché, lo devuelve en 0 milisegundos (carga ultra-rápida).
  // 2. En segundo plano hace un fetch a la red para actualizar la caché si el archivo cambió.
  // 3. Si no estaba en caché, lo descarga de internet y lo guarda para la próxima vez.
  // ----------------------------------------------------------------------------
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Si ya lo tenemos en caché:
      if (cachedResponse) {
        // Hacemos una revalidación silenciosa en segundo plano
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {
            // Si no hay red, no pasa nada; el usuario ya tiene su archivo desde la caché
          });

        return cachedResponse;
      }

      // Si NO está en caché, lo descargamos de internet y lo guardamos:
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
