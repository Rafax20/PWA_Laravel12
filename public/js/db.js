/**
 * db.js - Capa de almacenamiento local con IndexedDB
 * 
 * Gestiona el almacenamiento local offline de los productos, la cola de operaciones (sync_queue)
 * y los conflictos detectados.
 * 
 * NOTA TÉCNICA CLAVE:
 * Para permitir que dos pestañas en el mismo navegador (ej. ?device=A y ?device=B)
 * actúen como dos dispositivos físicos independientes, el nombre de la base de datos
 * se particiona por clientId: `pwa_demo_device_${clientId}`.
 */

class LocalDatabase {
  constructor(clientId) {
    this.clientId = clientId || 'A';
    this.dbName = `pwa_demo_device_${this.clientId}`;
    this.version = 1;
    this.db = null;
  }

  /**
   * Abre la base de datos de IndexedDB y crea los almacenes de objetos si no existen.
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Almacén de productos locales
        if (!db.objectStoreNames.contains('products')) {
          db.createObjectStore('products', { keyPath: 'id' });
        }

        // 2. Cola de operaciones de sincronización (sync_queue)
        if (!db.objectStoreNames.contains('sync_queue')) {
          const queueStore = db.createObjectStore('sync_queue', { keyPath: 'operation_id' });
          queueStore.createIndex('status', 'status', { unique: false });
          queueStore.createIndex('record_id', 'record_id', { unique: false });
        }

        // 3. Almacén de conflictos para resolución en interfaz
        if (!db.objectStoreNames.contains('conflicts')) {
          db.createObjectStore('conflicts', { keyPath: 'operation_id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('[IndexedDB] Error al abrir la base de datos:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // ==========================================
  // OPERACIONES DE PRODUCTOS (products)
  // ==========================================

  /**
   * Guarda o actualiza una lista de productos en IndexedDB
   */
  async saveProducts(products) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products'], 'readwrite');
      const store = tx.objectStore('products');

      products.forEach((product) => {
        // Aseguramos tipos de datos numéricos consistentes
        product.id = Number(product.id);
        product.price = Number(product.price);
        product.version = Number(product.version);
        store.put(product);
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene todos los productos guardados localmente
   */
  async getAllProducts() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products'], 'readonly');
      const store = tx.objectStore('products');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene un producto por su ID
   */
  async getProduct(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products'], 'readonly');
      const store = tx.objectStore('products');
      const request = store.get(Number(id));

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Actualiza los datos de un producto localmente (Optimistic UI)
   */
  async updateProduct(product) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products'], 'readwrite');
      const store = tx.objectStore('products');
      product.id = Number(product.id);
      product.price = Number(product.price);
      product.version = Number(product.version);
      store.put(product);

      tx.oncomplete = () => resolve(product);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ==========================================
  // COLA DE OPERACIONES (sync_queue)
  // ==========================================

  /**
   * Encola una nueva operación de modificación local
   */
  async enqueueOperation(op) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sync_queue'], 'readwrite');
      const store = tx.objectStore('sync_queue');

      const operationRecord = {
        operation_id: op.operation_id || crypto.randomUUID(),
        client_id: this.clientId,
        entity: op.entity || 'products',
        record_id: Number(op.record_id),
        operation_type: op.operation_type || 'update',
        payload: op.payload,
        base_version: Number(op.base_version),
        created_at: op.created_at || new Date().toISOString(),
        status: op.status || 'pending',
        force: op.force || false
      };

      store.put(operationRecord);

      tx.oncomplete = () => resolve(operationRecord);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene todas las operaciones pendientes en la cola
   */
  async getQueue() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sync_queue'], 'readonly');
      const store = tx.objectStore('sync_queue');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Elimina una operación de la cola una vez procesada con éxito
   */
  async removeOperation(operationId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sync_queue'], 'readwrite');
      const store = tx.objectStore('sync_queue');
      store.delete(operationId);

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Actualiza el estado de una operación en cola (ej. 'conflict')
   */
  async updateOperation(operationRecord) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sync_queue'], 'readwrite');
      const store = tx.objectStore('sync_queue');
      store.put(operationRecord);

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ==========================================
  // GESTIÓN DE CONFLICTOS (conflicts)
  // ==========================================

  /**
   * Guarda un conflicto detectado por el servidor
   */
  async saveConflict(conflictData) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['conflicts'], 'readwrite');
      const store = tx.objectStore('conflicts');
      store.put(conflictData);

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene la lista de conflictos pendientes de resolución
   */
  async getConflicts() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['conflicts'], 'readonly');
      const store = tx.objectStore('conflicts');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Elimina un conflicto resuelto
   */
  async removeConflict(operationId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['conflicts'], 'readwrite');
      const store = tx.objectStore('conflicts');
      store.delete(operationId);

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Limpia toda la base de datos local (útil para reiniciar pruebas)
   */
  async clearLocalData() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products', 'sync_queue', 'conflicts'], 'readwrite');
      tx.objectStore('products').clear();
      tx.objectStore('sync_queue').clear();
      tx.objectStore('conflicts').clear();

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }
}

// Exportación global para Vanilla JS
window.LocalDatabase = LocalDatabase;
