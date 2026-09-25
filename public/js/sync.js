/**
 * ==============================================================================
 * MOTOR DE SINCRONIZACIÓN OFFLINE-ONLINE E IDEMPOTENCIA (public/js/sync.js)
 * ==============================================================================
 * 
 * ¿QUÉ HACE ESTE MOTOR?
 * ------------------------------------------------------------------------------
 * Este script es el corazón de la sincronización de la PWA:
 * 1. Monitorea el estado de la conexión a internet (eventos 'online' y 'offline').
 * 2. Realiza PULL (GET): Descarga catálogos desde Laravel y actualiza IndexedDB.
 * 3. Realiza PUSH (POST): Envía operaciones encoladas cuando vuelve el internet.
 * 4. Maneja IDEMPOTENCIA: Cada operación lleva un UUID único para evitar duplicados.
 * 5. Detecta y resuelve CONFLICTOS de concurrencia optimista (versiones).
 * 6. Gestiona la instalación de la PWA en el sistema operativo del usuario.
 * ==============================================================================
 */

class SyncManager {
  /**
   * @param {LocalDatabase} localDb - Instancia de IndexedDB (db.js)
   * @param {Function} onStateChange - Callback para refrescar la interfaz gráfica
   * @param {Function} onLog - Callback para registrar eventos educativos en la consola de la UI
   */
  constructor(localDb, onStateChange, onLog) {
    this.db = localDb;
    this.onStateChange = onStateChange || (() => {});
    this.onLog = onLog || (() => {});

    // Estado de simulación offline persistido por dispositivo en localStorage
    this.storageKey = `pwa_simulated_offline_${this.db.clientId}`;
    this.simulatedOffline = localStorage.getItem(this.storageKey) === 'true';
    this.isSyncing = false;

    // --------------------------------------------------------------------------
    // DETECCIÓN NATIVA DE RED DEL NAVEGADOR
    // --------------------------------------------------------------------------
    // Evento 'online': Se dispara cuando el dispositivo recupera conexión Wi-Fi/4G real
    window.addEventListener('online', async () => {
      this.onLog('Red', 'El navegador detectó conexión a Internet real. Sincronizando automáticamente con Laravel...');
      if (!this.simulatedOffline) {
        this.onStateChange();
        await this.autoSync();
      }
    });

    // Evento 'offline': Se dispara cuando el dispositivo pierde conexión física
    window.addEventListener('offline', () => {
      this.onLog('Red', 'El navegador perdió la conexión a Internet real. Modo Offline activado.');
      this.onStateChange();
    });

    // Sincronizar el estado offline si el usuario lo cambia en otra pestaña del mismo dispositivo
    window.addEventListener('storage', (e) => {
      if (e.key === this.storageKey) {
        this.simulatedOffline = e.newValue === 'true';
        this.onStateChange();
      }
    });
  }

  /**
   * Retorna true si el navegador tiene internet Y no está activada la simulación offline
   */
  isOnline() {
    return navigator.onLine && !this.simulatedOffline;
  }

  /**
   * Conmuta la simulación de corte de red (para pruebas en desarrollo)
   */
  async toggleOfflineSimulation() {
    this.simulatedOffline = !this.simulatedOffline;
    localStorage.setItem(this.storageKey, this.simulatedOffline ? 'true' : 'false');

    if (this.simulatedOffline) {
      this.onLog('Simulación', `MODO OFFLINE ACTIVADO (Dispositivo ${this.db.clientId}). Las peticiones de red quedan bloqueadas.`, {
        estado: 'OFFLINE_SIMULADO',
        dispositivo: this.db.clientId
      });
    } else {
      this.onLog('Simulación', `MODO OFFLINE DESACTIVADO (Dispositivo ${this.db.clientId}). Conexión restablecida. Sincronizando...`, {
        estado: 'ONLINE',
        dispositivo: this.db.clientId
      });
      // Al volver online, disparamos sincronización automática (push pendientes + pull tablas)
      await this.autoSync();
    }
    this.onStateChange();
    return this.simulatedOffline;
  }

  /**
   * ============================================================================
   * MÉTODO PULL (Descarga de Datos desde Laravel -> IndexedDB)
   * ============================================================================
   * Consulta los endpoints de lectura en Laravel:
   * - GET /api/products     -> Catálogo oficial de productos
   * - GET /api/clients      -> Directorio de clientes
   * - GET /api/presupuestos -> Presupuestos registrados
   * 
   * Si no hay internet, lee silenciosamente desde IndexedDB sin arrojar error.
   */
  async pull() {
    if (!this.isOnline()) {
      this.onLog('IndexedDB', 'Dispositivo OFFLINE: Los datos se cargan exclusivamente desde la base local IndexedDB.');
      return {
        products: await this.db.getAllProducts(),
        presupuestos: await this.db.getAllPresupuestos(),
        clients: await this.db.getAllClients()
      };
    }

    try {
      this.onLog('Laravel API', 'Consultando GET /api/products, GET /api/presupuestos y GET /api/clients...');

      // Consultamos en paralelo las 3 APIs para máxima velocidad de respuesta:
      const [prodFetch, clientFetch, presFetch] = await Promise.allSettled([
        fetch('/api/products', { headers: { 'Accept': 'application/json' } }),
        fetch('/api/clients', { headers: { 'Accept': 'application/json' } }),
        fetch('/api/presupuestos', { headers: { 'Accept': 'application/json' } })
      ]);

      // 1. Guardar Productos en IndexedDB
      if (prodFetch.status === 'fulfilled' && prodFetch.value.ok) {
        try {
          const prodData = await prodFetch.value.json();
          if (prodData.products && Array.isArray(prodData.products)) {
            await this.db.saveProducts(prodData.products);
            this.onLog('IndexedDB', `✓ Catálogo actualizado: ${prodData.products.length} productos sincronizados.`);
          }
        } catch (errProd) {
          console.warn('[SyncManager] Error al parsear productos:', errProd);
        }
      }

      // 2. Guardar Clientes en IndexedDB
      if (clientFetch.status === 'fulfilled' && clientFetch.value.ok) {
        try {
          const clientData = await clientFetch.value.json();
          if (clientData.clients && Array.isArray(clientData.clients)) {
            await this.db.saveClients(clientData.clients);
            this.onLog('IndexedDB', `✓ Directorio de clientes actualizado: ${clientData.clients.length} clientes sincronizados.`);
          }
        } catch (errClient) {
          console.warn('[SyncManager] Error al parsear clientes:', errClient);
        }
      }

      // 3. Fusionar Presupuestos oficiales del servidor con los locales
      if (presFetch.status === 'fulfilled' && presFetch.value.ok) {
        try {
          const presData = await presFetch.value.json();
          if (presData.presupuestos && Array.isArray(presData.presupuestos)) {
            const localBudgets = await this.db.getAllPresupuestos();
            let newSyncedCount = 0;
            let updatedCount = 0;

            for (const serverP of presData.presupuestos) {
              const matched = localBudgets.find(b =>
                (b.server_id && b.server_id === serverP.id) ||
                (b.correlativo && b.correlativo === serverP.correlativo) ||
                (serverP.temp_correlativo && (b.correlativo === serverP.temp_correlativo || b.local_id === serverP.temp_correlativo))
              );

              if (matched) {
                matched.correlativo = serverP.correlativo;
                matched.status = 'sincronizado';
                matched.server_id = serverP.id;
                matched.items = serverP.items || matched.items;
                matched.subtotal = Number(serverP.subtotal);
                matched.tax = Number(serverP.tax);
                matched.total = Number(serverP.total);
                matched.client_name = serverP.client_name || matched.client_name;
                matched.version = serverP.version || matched.version || 1;
                matched.synced_at = serverP.updated_at || new Date().toISOString();
                await this.db.savePresupuesto(matched);
                updatedCount++;
              } else {
                newSyncedCount++;
                await this.db.savePresupuesto({
                  local_id: 'srv_' + serverP.id,
                  server_id: serverP.id,
                  correlativo: serverP.correlativo,
                  temp_correlativo: serverP.temp_correlativo,
                  client_id: serverP.client_id,
                  client_name: serverP.client_name,
                  items: serverP.items || [],
                  subtotal: Number(serverP.subtotal),
                  tax: Number(serverP.tax),
                  total: Number(serverP.total),
                  version: serverP.version || 1,
                  status: 'sincronizado',
                  created_at: serverP.created_at,
                  synced_at: serverP.updated_at || new Date().toISOString()
                });
              }
            }

            if (newSyncedCount > 0 || updatedCount > 0) {
              this.onLog('IndexedDB', `✓ Presupuestos sincronizados: ${newSyncedCount} nuevo(s) descargados, ${updatedCount} actualizados.`);
            }
          }
        } catch (errPres) {
          console.warn('[SyncManager] Error al sincronizar presupuestos:', errPres);
        }
      }

      return {
        products: await this.db.getAllProducts(),
        presupuestos: await this.db.getAllPresupuestos(),
        clients: await this.db.getAllClients()
      };
    } catch (err) {
      this.onLog('Red', `Fallo al conectar con Laravel (${err.message}). Cargando desde IndexedDB local.`);
      return {
        products: await this.db.getAllProducts(),
        presupuestos: await this.db.getAllPresupuestos(),
        clients: await this.db.getAllClients()
      };
    }
  }

  /**
   * ============================================================================
   * MÉTODO PUSH (Envío de Operaciones Encoladas -> Laravel)
   * ============================================================================
   * Envía por POST a '/api/sync/push' todas las operaciones pendientes en 'sync_queue'.
   * 
   * Cada operación incluye:
   * - operation_id: UUID único para garantizar IDEMPOTENCIA.
   * - base_version: Versión que tenía el registro al ser editado (para detectar conflictos).
   */
  async push() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.onStateChange();

    try {
      const queue = await this.db.getQueue();
      const pendingOps = queue.filter(op => op.status === 'pending');

      if (pendingOps.length === 0) {
        this.onLog('Sincronización', 'No hay operaciones pendientes de envío en sync_queue.');
        this.isSyncing = false;
        this.onStateChange();
        return;
      }

      if (!this.isOnline()) {
        this.onLog('Offline', `Existen ${pendingOps.length} cambio(s) pendientes pero no hay red. Los datos están seguros en IndexedDB.`);
        this.isSyncing = false;
        this.onStateChange();
        return;
      }

      this.onLog('Laravel API', `Enviando POST /api/sync/push con ${pendingOps.length} operación(es)...`);

      // LLAMADA HTTP A LARAVEL:
      const response = await fetch('/api/sync/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ operations: pendingOps })
      });

      if (!response.ok) {
        throw new Error(`Error en servidor: ${response.status}`);
      }

      const data = await response.json();
      const results = data.results || [];

      // Procesamos cada resultado devuelto por Laravel
      for (const res of results) {
        // CASO 1: Operación aceptada y procesada con éxito
        if (res.status === 'SUCCESS') {
          await this.db.removeOperation(res.operation_id);

          if (res.entity === 'presupuestos' || res.presupuesto) {
            const localBudgets = await this.db.getAllPresupuestos();
            const localB = localBudgets.find(b =>
              b.local_id === res.operation_id ||
              (res.presupuesto && b.server_id === res.presupuesto.id) ||
              b.correlativo === res.temp_correlativo ||
              b.correlativo === res.official_correlativo
            );

            if (localB) {
              localB.correlativo = res.official_correlativo || localB.correlativo;
              localB.status = 'sincronizado';
              if (res.presupuesto) {
                localB.server_id = res.presupuesto.id;
                localB.items = res.presupuesto.items || localB.items;
                localB.subtotal = Number(res.presupuesto.subtotal);
                localB.tax = Number(res.presupuesto.tax);
                localB.total = Number(res.presupuesto.total);
                localB.version = res.presupuesto.version;
                localB.client_name = res.presupuesto.client_name;
              }
              localB.synced_at = new Date().toISOString();
              await this.db.savePresupuesto(localB);
            }

            this.onLog('Laravel API', `✓ Presupuesto sincronizado: Asignado correlativo oficial ${res.official_correlativo}.`);
          } else if (res.product) {
            await this.db.updateProduct(res.product);
            this.onLog('Laravel API', `✓ Producto ${res.product.name} actualizado a versión ${res.product.version}.`);
          }
        }
        // CASO 2: IDEMPOTENCIA DETECTADA (La operación ya había sido procesada)
        else if (res.status === 'ALREADY_PROCESSED') {
          await this.db.removeOperation(res.operation_id);
          this.onLog('Idempotencia', `ℹ IDEMPOTENCIA: La operación ${res.operation_id.slice(0, 8)}... ya estaba procesada. No se duplicaron datos.`);
        }
        // CASO 3: CONFLICTO DE CONCURRENCIA (Alguien modificó el registro mientras estabas offline)
        else if (res.status === 'CONFLICT') {
          const conflictData = {
            operation_id: res.operation_id,
            client_id: res.client_id,
            record_id: pendingOps.find(o => o.operation_id === res.operation_id)?.record_id,
            server_version: res.server_version,
            server_data: res.server_data,
            device_payload: res.device_payload,
            base_version: res.base_version,
            created_at: new Date().toISOString()
          };

          await this.db.saveConflict(conflictData);

          const op = pendingOps.find(o => o.operation_id === res.operation_id);
          if (op) {
            op.status = 'conflict';
            await this.db.updateOperation(op);
          }

          this.onLog('Conflicto', `⚠ CONFLICTO: El servidor tiene versión ${res.server_version} pero el dispositivo envió versión ${res.base_version}.`);
        }
      }

    } catch (err) {
      this.onLog('Error', `Error durante la sincronización: ${err.message}`);
    } finally {
      this.isSyncing = false;
      this.onStateChange();
    }
  }

  /**
   * Sincronización automática silenciosa (Push + Pull)
   */
  async autoSync() {
    if (this.isOnline()) {
      await this.push();
      await this.pull();
      this.onStateChange();
    }
  }

  /**
   * Resuelve un conflicto específico según la decisión del usuario
   * @param {string} operationId - UUID de la operación
   * @param {'keep_server' | 'use_device'} resolution - Decisión tomada
   */
  async resolveConflict(operationId, resolution) {
    const conflicts = await this.db.getConflicts();
    const conflict = conflicts.find(c => c.operation_id === operationId);
    if (!conflict) return;

    if (resolution === 'keep_server') {
      await this.db.removeOperation(operationId);
      await this.db.removeConflict(operationId);

      if (conflict.server_data) {
        await this.db.updateProduct(conflict.server_data);
      }

      this.onLog('Resolución', `Resolución: Se conservaron los datos del servidor (versión ${conflict.server_data.version}).`);
      this.onStateChange();
    } 
    else if (resolution === 'use_device') {
      if (!this.isOnline()) {
        alert('Debe tener conexión activa para enviar la resolución al servidor.');
        return;
      }

      this.onLog('Resolución', 'Resolución: Forzando actualización con los datos del dispositivo...');

      const forceOperation = {
        operation_id: crypto.randomUUID(),
        client_id: this.db.clientId,
        entity: 'products',
        record_id: conflict.record_id,
        operation_type: 'update',
        payload: conflict.device_payload,
        base_version: conflict.server_version,
        force: true
      };

      try {
        const response = await fetch('/api/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ operations: [forceOperation] })
        });

        const data = await response.json();
        const res = (data.results || [])[0];

        if (res && res.status === 'SUCCESS') {
          await this.db.removeOperation(operationId);
          await this.db.removeConflict(operationId);
          await this.db.updateProduct(res.product);
          this.onLog('Resolución', `✓ Conflicto resuelto: El servidor adoptó el cambio forzado.`);
        }
      } catch (err) {
        this.onLog('Error', `Error al resolver conflicto: ${err.message}`);
      }

      this.onStateChange();
    }
  }

  /**
   * Reenvía intencionalmente una operación procesada para demostrar idempotencia
   */
  async testIdempotency(operationId, recordId, payload, entity = 'products') {
    if (!this.isOnline()) {
      alert('Active la conexión para probar la idempotencia con Laravel.');
      return;
    }

    this.onLog('Idempotencia', `[PRUEBA]: Reenviando operación duplicada ${operationId.slice(0, 8)}... a Laravel.`);

    try {
      const operationData = {
        operation_id: operationId,
        client_id: this.db.clientId,
        entity: entity,
        record_id: recordId,
        operation_type: entity === 'presupuestos' ? 'create_budget' : 'update',
        payload: payload,
        base_version: 1
      };

      const response = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ operations: [operationData] })
      });

      const data = await response.json();
      const res = (data.results || [])[0];
      if (res && res.status === 'ALREADY_PROCESSED') {
        this.onLog('Idempotencia', `✓ RESULTADO EXITOSO: Laravel detectó duplicado y respondió: "${res.message}". Base de datos intacta.`);
      } else {
        this.onLog('Idempotencia', `Respuesta del servidor: ${res ? res.message : 'OK'}`);
      }
    } catch (e) {
      this.onLog('Error', `Error en prueba de idempotencia: ${e.message}`);
    }
  }
}

// Exportamos SyncManager globalmente
window.SyncManager = SyncManager;

// ==============================================================================
// REGISTRO GLOBAL DEL SERVICE WORKER
// ==============================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      console.log('[PWA] Service Worker registrado. Scope:', reg.scope);
    } catch (err) {
      console.warn('[PWA] Error al registrar Service Worker:', err);
    }
  });
}

// ==============================================================================
// CAPTURADOR DE INSTALACIÓN PWA (beforeinstallprompt)
// ==============================================================================
let deferredPwaInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // Evitamos diálogo invasivo automático
  deferredPwaInstallPrompt = e;
  // Hacemos visibles todos los botones con clase .btn-install-pwa
  document.querySelectorAll('.btn-install-pwa').forEach(btn => {
    btn.style.display = 'inline-flex';
  });
  console.log('[PWA] Aplicación lista para instalar.');
});

// Mostrar botón si estamos en un navegador convencional (no standalone)
document.addEventListener('DOMContentLoaded', () => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (!isStandalone) {
    document.querySelectorAll('.btn-install-pwa').forEach(btn => {
      btn.style.display = 'inline-flex';
    });
  }
});

window.addEventListener('appinstalled', () => {
  deferredPwaInstallPrompt = null;
  document.querySelectorAll('.btn-install-pwa').forEach(btn => {
    btn.style.display = 'none';
  });
  console.log('[PWA] Aplicación instalada exitosamente en el sistema.');
});

/**
 * Función disparada al hacer clic en cualquier botón de instalación
 */
window.triggerPwaInstall = async () => {
  if (deferredPwaInstallPrompt) {
    deferredPwaInstallPrompt.prompt();
    const { outcome } = await deferredPwaInstallPrompt.userChoice;
    deferredPwaInstallPrompt = null;
    if (outcome === 'accepted') {
      document.querySelectorAll('.btn-install-pwa').forEach(btn => {
        btn.style.display = 'none';
      });
    }
  } else {
    alert('Para instalar en Chrome / Edge:\n\n1. En el menú de Chrome arriba a la derecha (⋮)\n2. Haz clic en "Enviar, guardar y compartir"\n3. Selecciona "Instalar página como aplicación".');
  }
};
