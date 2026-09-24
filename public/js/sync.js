/**
 * sync.js - Motor de sincronización, detección de red y resolución de conflictos
 */

class SyncManager {
  constructor(localDb, onStateChange, onLog) {
    this.db = localDb;
    this.onStateChange = onStateChange || (() => {});
    this.onLog = onLog || (() => {});

    // Estado de red simulada persistido por dispositivo en localStorage
    this.storageKey = `pwa_simulated_offline_${this.db.clientId}`;
    this.simulatedOffline = localStorage.getItem(this.storageKey) === 'true';
    this.isSyncing = false;

    // Escuchadores de eventos de red del navegador
    window.addEventListener('online', () => {
      this.onLog('Red', 'El navegador detectó conexión a Internet real.');
      if (!this.simulatedOffline) {
        this.onStateChange();
        this.autoSync();
      }
    });

    window.addEventListener('offline', () => {
      this.onLog('Red', 'El navegador perdió la conexión a Internet real.');
      this.onStateChange();
    });

    // Sincronizar el estado offline si otra pestaña del mismo dispositivo lo modifica
    window.addEventListener('storage', (e) => {
      if (e.key === this.storageKey) {
        this.simulatedOffline = e.newValue === 'true';
        this.onStateChange();
      }
    });
  }

  /**
   * Indica si la aplicación tiene conectividad activa (considerando la simulación)
   */
  isOnline() {
    return navigator.onLine && !this.simulatedOffline;
  }

  /**
   * Conmuta la simulación de corte de red offline persistida en localStorage
   */
  async toggleOfflineSimulation() {
    this.simulatedOffline = !this.simulatedOffline;
    localStorage.setItem(this.storageKey, this.simulatedOffline ? 'true' : 'false');

    if (this.simulatedOffline) {
      this.onLog('Simulación', `MODO OFFLINE ACTIVADO (Dispositivo ${this.db.clientId}). Las peticiones al servidor quedan bloqueadas y el estado persiste entre páginas.`, {
        estado: 'OFFLINE_SIMULADO',
        dispositivo: this.db.clientId
      });
    } else {
      this.onLog('Simulación', `MODO OFFLINE DESACTIVADO (Dispositivo ${this.db.clientId}). La conexión al servidor fue restablecida.`, {
        estado: 'ONLINE',
        dispositivo: this.db.clientId
      });
      // Al volver la conexión, disparamos sincronización automática
      await this.autoSync();
    }
    this.onStateChange();
    return this.simulatedOffline;
  }

  /**
   * Descarga la lista más reciente de productos y presupuestos desde Laravel y actualiza IndexedDB
   */
  async pull() {
    if (!this.isOnline()) {
      this.onLog('IndexedDB', 'Dispositivo OFFLINE: No es posible consultar el servidor Laravel. Los datos se cargan exclusivamente desde la base local IndexedDB.');
      return {
        products: await this.db.getAllProducts(),
        presupuestos: await this.db.getAllPresupuestos()
      };
    }

    try {
      this.onLog('Laravel API', 'Consultando GET /api/products y GET /api/presupuestos para obtener el estado oficial...');

      // 1. Descargar Productos
      const prodRes = await fetch('/api/products', {
        headers: { 'Accept': 'application/json' }
      });
      if (prodRes.ok) {
        const prodData = await prodRes.json();
        if (prodData.products && Array.isArray(prodData.products)) {
          await this.db.saveProducts(prodData.products);
          this.onLog('IndexedDB', `Copia local de catálogo actualizada: ${prodData.products.length} productos sincronizados con Laravel.`);
        }
      }

      // 2. Descargar Presupuestos oficiales del servidor
      try {
        const presRes = await fetch('/api/presupuestos', {
          headers: { 'Accept': 'application/json' }
        });
        if (presRes.ok) {
          const presData = await presRes.json();
          if (presData.presupuestos && Array.isArray(presData.presupuestos)) {
            let newSyncedCount = 0;
            for (const serverP of presData.presupuestos) {
              const matched = localBudgets.find(b =>
                (b.server_id && b.server_id === serverP.id) ||
                b.correlativo === serverP.correlativo ||
                (serverP.temp_correlativo && b.correlativo === serverP.temp_correlativo) ||
                (serverP.temp_correlativo && b.local_id === serverP.temp_correlativo)
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
                await this.db.savePresupuesto(matched);
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
                  synced_at: serverP.updated_at
                });
              }
            }
            if (newSyncedCount > 0) {
              this.onLog('IndexedDB', `✓ Descargados ${newSyncedCount} nuevo(s) presupuesto(s) del servidor para este dispositivo.`);
            }
          }
        }
      } catch (errPres) {
        console.warn('[SyncManager] Error al sincronizar presupuestos del servidor:', errPres);
      }

      return {
        products: await this.db.getAllProducts(),
        presupuestos: await this.db.getAllPresupuestos()
      };
    } catch (err) {
      this.onLog('Red', `Fallo al conectar con Laravel (${err.message}). Cargando desde IndexedDB.`);
      return {
        products: await this.db.getAllProducts(),
        presupuestos: await this.db.getAllPresupuestos()
      };
    }
  }

  /**
   * Envía a Laravel todas las operaciones pendientes guardadas en la cola local
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
        this.onLog('Offline', `Existen ${pendingOps.length} cambio(s) pendientes pero el dispositivo está OFFLINE. Los cambios permanecen resguardados en IndexedDB.`);
        this.isSyncing = false;
        this.onStateChange();
        return;
      }

      this.onLog('Laravel API', `Enviando POST /api/sync/push con ${pendingOps.length} operación(es) pendiente(s)...`, {
        dispositivo: this.db.clientId,
        operaciones: pendingOps.map(o => ({
          id: o.operation_id,
          entidad: o.entity || 'products',
          registro_id: o.record_id,
          tipo: o.operation_type
        }))
      });

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

      for (const res of results) {
        if (res.status === 'SUCCESS') {
          // 1. Operación aceptada por el servidor
          await this.db.removeOperation(res.operation_id);

          if (res.entity === 'presupuestos' || res.presupuesto) {
            // Actualizar presupuesto local en IndexedDB con el nuevo correlativo oficial y versión
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

            if (res.operation_type === 'update_budget') {
              this.onLog('Laravel API', `✓ Presupuesto ${res.official_correlativo} editado en Laravel (Nueva versión: ${res.presupuesto ? res.presupuesto.version : 2}, Operation ID: ${res.operation_id.slice(0, 8)}...).`, {
                operacion_id: res.operation_id,
                correlativo: res.official_correlativo,
                version: res.presupuesto ? res.presupuesto.version : 2,
                total: res.presupuesto ? `$${Number(res.presupuesto.total).toFixed(2)}` : null
              });
            } else {
              this.onLog('Laravel API', `✓ Presupuesto sincronizado: Correlativo ${res.temp_correlativo || ''} reemplazado por correlativo oficial ${res.official_correlativo}.`, {
                operacion_id: res.operation_id,
                correlativo_oficial: res.official_correlativo,
                cliente: res.presupuesto ? res.presupuesto.client_name : null,
                total: res.presupuesto ? `$${Number(res.presupuesto.total).toFixed(2)}` : null
              });
            }
          } else if (res.product) {
            await this.db.updateProduct(res.product);
            this.onLog('Laravel API', `✓ Operación ${res.operation_id.slice(0, 8)}... ACEPTADA por Laravel. Producto ${res.product.name} actualizado a versión ${res.product.version}.`, {
              operacion_id: res.operation_id,
              nueva_version: res.product.version,
              nuevo_precio: res.product.price
            });
          }
        }
        else if (res.status === 'ALREADY_PROCESSED') {
          // 2. Idempotencia: Laravel ya había procesado este operation_id
          await this.db.removeOperation(res.operation_id);

          if (res.entity === 'presupuestos' || res.official_correlativo) {
            const localBudgets = await this.db.getAllPresupuestos();
            const localB = localBudgets.find(b =>
              b.local_id === res.operation_id ||
              b.correlativo === res.temp_correlativo ||
              b.correlativo === res.official_correlativo
            );

            if (localB) {
              if (res.official_correlativo) localB.correlativo = res.official_correlativo;
              localB.status = 'sincronizado';
              await this.db.savePresupuesto(localB);
            }

            this.onLog('Idempotencia', `ℹ IDEMPOTENCIA: El presupuesto ${res.official_correlativo || res.temp_correlativo} ya estaba registrado en Laravel. No se crearon duplicados.`);
          } else {
            this.onLog('Idempotencia', `ℹ IDEMPOTENCIA: Laravel detectó que la operación ${res.operation_id.slice(0, 8)}... ya había sido procesada anteriormente. No se aplicaron cambios duplicados.`);
          }
        }
        else if (res.status === 'CONFLICT') {
          // 3. Conflicto: La versión del servidor cambió mientras este dispositivo estaba offline
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

          this.onLog('Conflicto', `⚠ ¡CONFLICTO DETECTADO EN LARAVEL! El servidor tiene versión ${res.server_version} pero el dispositivo ${res.client_id} envió base_version ${res.base_version}. Laravel rechazó la sobreescritura automática.`, {
            servidor: res.server_data,
            cambio_dispositivo: res.device_payload
          });
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
   * Sincronización automática silenciosa
   */
  async autoSync() {
    if (this.isOnline()) {
      await this.push();
      await this.pull();
      this.onStateChange();
    }
  }

  /**
   * Resuelve un conflicto específico según la elección del usuario
   * @param {string} operationId 
   * @param {'keep_server' | 'use_device'} resolution 
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

      this.onLog('Resolución', `Resolución de conflicto: Se eligió [CONSERVAR SERVIDOR]. Se descartó el cambio local del Dispositivo ${this.db.clientId} y se adoptó el precio de $${conflict.server_data.price} (versión ${conflict.server_data.version}).`);
      this.onStateChange();
    } 
    else if (resolution === 'use_device') {
      if (!this.isOnline()) {
        alert('Debe tener conexión activa para forzar la sincronización del cambio.');
        return;
      }

      this.onLog('Resolución', `Resolución de conflicto: Se eligió [USAR CAMBIO DEL DISPOSITIVO]. Enviando solicitud forzada a Laravel para sobrescribir con el precio de $${conflict.device_payload.price}...`);

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

          this.onLog('Resolución', `✓ Conflicto resuelto: Laravel aceptó el cambio forzado. El nuevo precio oficial es $${res.product.price} y la nueva versión es ${res.product.version}.`);
        }
      } catch (err) {
        this.onLog('Error', `Error al forzar resolución: ${err.message}`);
      }

      this.onStateChange();
    }
  }

  /**
   * Simula el reenvío de una operación ya procesada para verificar idempotencia
   */
  async testIdempotency(operationId, recordId, payload, entity = 'products') {
    if (!this.isOnline()) {
      alert('Conecte el dispositivo para probar la idempotencia con Laravel.');
      return;
    }

    const isBudget = entity === 'presupuestos' || (payload && payload.correlativo);
    const label = isBudget ? `Presupuesto (${payload.correlativo || recordId})` : `Producto ID ${recordId}`;

    this.onLog('Idempotencia', `[PRUEBA DE IDEMPOTENCIA]: Reenviando a propósito la operación ${operationId.slice(0, 8)}... (${label}) para comprobar que Laravel la rechaza como duplicada.`);

    try {
      const operationData = {
        operation_id: operationId,
        client_id: this.db.clientId,
        entity: isBudget ? 'presupuestos' : 'products',
        record_id: recordId,
        operation_type: isBudget ? 'create_budget' : 'update',
        payload: payload,
        base_version: 1
      };

      const response = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          operations: [operationData]
        })
      });

      const data = await response.json();
      const res = (data.results || [])[0];
      if (res && res.status === 'ALREADY_PROCESSED') {
        this.onLog('Idempotencia', `✓ RESULTADO EXITOSO DE IDEMPOTENCIA: Laravel respondió "${res.message}". La base de datos no fue modificada ni duplicada.`);
      } else if (res && res.status === 'SUCCESS') {
        this.onLog('Idempotencia', `ℹ Operación procesada por primera vez: ${res.message}`);
      } else {
        this.onLog('Idempotencia', `Respuesta del servidor: ${res ? res.message : 'Sin respuesta'}`);
      }
    } catch (e) {
      this.onLog('Error', `Error en prueba de idempotencia: ${e.message}`);
    }
  }
}

// Exportación global para Vanilla JS
window.SyncManager = SyncManager;
