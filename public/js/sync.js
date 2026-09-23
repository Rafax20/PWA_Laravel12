/**
 * sync.js - Motor de sincronización, detección de red y resolución de conflictos
 */

class SyncManager {
  constructor(localDb, onStateChange, onLog) {
    this.db = localDb;
    this.onStateChange = onStateChange || (() => {});
    this.onLog = onLog || (() => {});

    // Estado de red simulada para fines de la demo educativa
    this.simulatedOffline = false;
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
  }

  /**
   * Indica si la aplicación tiene conectividad activa (considerando la simulación)
   */
  isOnline() {
    return navigator.onLine && !this.simulatedOffline;
  }

  /**
   * Conmuta la simulación de corte de red offline
   */
  async toggleOfflineSimulation() {
    this.simulatedOffline = !this.simulatedOffline;
    if (this.simulatedOffline) {
      this.onLog('Simulación', 'MODO OFFLINE ACTIVADO. Las peticiones al servidor quedan bloqueadas.', {
        estado: 'OFFLINE_SIMULADO'
      });
    } else {
      this.onLog('Simulación', 'MODO OFFLINE DESACTIVADO. La conexión al servidor fue restablecida.', {
        estado: 'ONLINE'
      });
      // Al volver la conexión, disparamos sincronización automática
      await this.autoSync();
    }
    this.onStateChange();
    return this.simulatedOffline;
  }

  /**
   * Descarga la lista más reciente de productos desde Laravel y actualiza IndexedDB
   */
  async pull() {
    if (!this.isOnline()) {
      this.onLog('IndexedDB', 'Dispositivo OFFLINE: No es posible consultar el servidor Laravel. Los datos se cargan exclusivamente desde la base local IndexedDB.');
      return await this.db.getAllProducts();
    }

    try {
      this.onLog('Laravel API', 'Consultando GET /api/products para obtener el estado oficial del servidor...');
      const response = await fetch('/api/products', {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const data = await response.json();
      if (data.products && Array.isArray(data.products)) {
        await this.db.saveProducts(data.products);
        this.onLog('IndexedDB', `Copia local actualizada: ${data.products.length} productos guardados en IndexedDB con sus versiones oficiales del servidor.`);
      }
      return data.products;
    } catch (err) {
      this.onLog('Red', `Fallo al conectar con Laravel (${err.message}). Cargando desde IndexedDB.`);
      return await this.db.getAllProducts();
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
      // Filtramos operaciones que aún no están resueltas ni en conflicto
      const pendingOps = queue.filter(op => op.status === 'pending');

      if (pendingOps.length === 0) {
        this.onLog('Sincronización', 'No hay operaciones pendientes de envío en sync_queue.');
        this.isSyncing = false;
        this.onStateChange();
        return;
      }

      if (!this.isOnline()) {
        this.onLog('Offline', `Existen ${pendingOps.length} cambio(s) pendientes pero el dispositivo está OFFLINE. Los cambios permanecen en la cola local.`);
        this.isSyncing = false;
        this.onStateChange();
        return;
      }

      this.onLog('Laravel API', `Enviando POST /api/sync/push con ${pendingOps.length} operación(es) pendiente(s)...`, {
        dispositivo: this.db.clientId,
        operaciones: pendingOps.map(o => ({
          id: o.operation_id,
          producto_id: o.record_id,
          version_base: o.base_version,
          nuevo_precio: o.payload.price
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
          if (res.product) {
            await this.db.updateProduct(res.product);
          }
          this.onLog('Laravel API', `✓ Operación ${res.operation_id.slice(0, 8)}... ACEPTADA por Laravel. Producto ${res.product.name} actualizado a versión ${res.product.version}.`, {
            operacion_id: res.operation_id,
            nueva_version: res.product.version,
            nuevo_precio: res.product.price
          });
        } 
        else if (res.status === 'ALREADY_PROCESSED') {
          // 2. Idempotencia: Laravel ya había procesado este operation_id
          await this.db.removeOperation(res.operation_id);
          this.onLog('Idempotencia', `ℹ IDEMPOTENCIA: Laravel detectó que la operación ${res.operation_id.slice(0, 8)}... ya había sido procesada anteriormente. No se aplicaron cambios duplicados.`);
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
          
          // Actualizamos estado en cola para no reenviar hasta resolver
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
      // Opción A: Conservar los datos del servidor
      await this.db.removeOperation(operationId);
      await this.db.removeConflict(operationId);

      // Actualizamos la copia local de IndexedDB con la versión oficial del servidor
      if (conflict.server_data) {
        await this.db.updateProduct(conflict.server_data);
      }

      this.onLog('Resolución', `Resolución de conflicto: Se eligió [CONSERVAR SERVIDOR]. Se descartó el cambio local del Dispositivo ${this.db.clientId} y se adoptó el precio de $${conflict.server_data.price} (versión ${conflict.server_data.version}).`);
      this.onStateChange();
    } 
    else if (resolution === 'use_device') {
      // Opción B: Forzar el cambio del dispositivo
      if (!this.isOnline()) {
        alert('Debe tener conexión activa para forzar la sincronización del cambio.');
        return;
      }

      this.onLog('Resolución', `Resolución de conflicto: Se eligió [USAR CAMBIO DEL DISPOSITIVO]. Enviando solicitud forzada a Laravel para sobrescribir con el precio de $${conflict.device_payload.price}...`);

      const forceOperation = {
        operation_id: crypto.randomUUID(), // Nuevo UUID para esta resolución forzada
        client_id: this.db.clientId,
        entity: 'products',
        record_id: conflict.record_id,
        operation_type: 'update',
        payload: conflict.device_payload,
        base_version: conflict.server_version, // Actualizamos base_version a la del servidor
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
  async testIdempotency(operationId, recordId, payload) {
    if (!this.isOnline()) {
      alert('Conecte el dispositivo para probar la idempotencia con Laravel.');
      return;
    }

    this.onLog('Idempotencia', `[PRUEBA DE IDEMPOTENCIA]: Reenviando a propósito la operación ${operationId.slice(0, 8)}... para comprobar que Laravel la rechaza como duplicada.`);

    try {
      const response = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          operations: [{
            operation_id: operationId,
            client_id: this.db.clientId,
            record_id: recordId,
            operation_type: 'update',
            payload: payload,
            base_version: 1
          }]
        })
      });

      const data = await response.json();
      const res = (data.results || [])[0];
      if (res && res.status === 'ALREADY_PROCESSED') {
        this.onLog('Idempotencia', `✓ RESULTADO EXITOSO: Laravel respondió "${res.message}". La base de datos no fue modificada nuevamente.`);
      }
    } catch (e) {
      this.onLog('Error', `Error en prueba de idempotencia: ${e.message}`);
    }
  }
}

// Exportación global para Vanilla JS
window.SyncManager = SyncManager;
