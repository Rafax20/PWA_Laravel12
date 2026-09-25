/**
 * ==============================================================================
 * MOTOR DE BASE DE DATOS LOCAL OFFLINE (public/js/db.js)
 * ==============================================================================
 * 
 * ¿QUÉ ES INDEXEDDB Y POR QUÉ SE USA AQUÍ?
 * ------------------------------------------------------------------------------
 * IndexedDB es una base de datos NoSQL transaccional de alto rendimiento que vive
 * dentro del navegador del usuario (Chrome, Edge, Safari, Firefox).
 * 
 * A diferencia de localStorage (que solo guarda strings y tiene un límite de 5MB),
 * IndexedDB permite:
 * 1. Guardar cientos de Megabytes de datos estructurados (objetos JSON, números, arrays).
 * 2. Realizar búsquedas indexadas y transacciones ACID.
 * 3. Consultar y modificar datos INCLUSO SI NO HAY CONEXIÓN A INTERNET.
 * 
 * ARQUITECTURA MULTI-DISPOSITIVO (DEMO):
 * Particionamos el nombre de la base de datos por `clientId` (`pwa_demo_device_${clientId}`)
 * para que en un mismo navegador puedas abrir dos pestañas (?device=A y ?device=B) y cada una
 * actúe como si fuera un teléfono físico separado. En producción en una empresa real,
 * se usaría un nombre único como `empresa_local_db`.
 * ==============================================================================
 */

class LocalDatabase {
  constructor(clientId) {
    this.clientId = clientId || 'A';
    this.dbName = `pwa_demo_device_${this.clientId}`;
    this.version = 2; // Incrementar la versión si se agregan nuevos object stores en el futuro
    this.db = null;
  }

  /**
   * ============================================================================
   * 1. INICIALIZACIÓN Y ESQUEMA (init)
   * ============================================================================
   * Abre la conexión con IndexedDB y crea las tablas ("Object Stores") si no existen.
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      // onupgradeneeded se ejecuta la primera vez que se crea la BD o al subir la versión
      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // TABLA 1: 'products' -> Almacena el catálogo de productos con su id y versión
        if (!db.objectStoreNames.contains('products')) {
          db.createObjectStore('products', { keyPath: 'id' });
        }

        // TABLA 2: 'sync_queue' -> Cola de operaciones pendientes por enviar al servidor
        if (!db.objectStoreNames.contains('sync_queue')) {
          const queueStore = db.createObjectStore('sync_queue', { keyPath: 'operation_id' });
          queueStore.createIndex('status', 'status', { unique: false });
          queueStore.createIndex('record_id', 'record_id', { unique: false });
        }

        // TABLA 3: 'conflicts' -> Almacena registros en conflicto (cuando otro usuario editó en el servidor)
        if (!db.objectStoreNames.contains('conflicts')) {
          db.createObjectStore('conflicts', { keyPath: 'operation_id' });
        }

        // TABLA 4: 'clients' -> Almacena clientes locales
        if (!db.objectStoreNames.contains('clients')) {
          db.createObjectStore('clients', { keyPath: 'id' });
        }

        // TABLA 5: 'presupuestos' -> Almacena presupuestos generados offline
        if (!db.objectStoreNames.contains('presupuestos')) {
          db.createObjectStore('presupuestos', { keyPath: 'local_id' });
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

  // ============================================================================
  // 2. OPERACIONES DE PRODUCTOS (products)
  // ============================================================================

  /**
   * Guarda o actualiza masivamente productos en IndexedDB
   * @param {Array} products - Lista de productos recibida de Laravel o generada localmente
   */
  async saveProducts(products) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products'], 'readwrite');
      const store = tx.objectStore('products');

      products.forEach((product) => {
        // Normalizamos tipos numéricos para evitar inconsistencias
        product.id = Number(product.id);
        product.price = Number(product.price);
        product.version = Number(product.version);
        store.put(product); // put() inserta si no existe, o actualiza si ya existe
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene todos los productos guardados localmente en el dispositivo
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
   * Obtiene un producto individual por su ID primario
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
   * Actualización optimista de un producto en la interfaz local
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

  // ============================================================================
  // 3. COLA DE SINCRONIZACIÓN (sync_queue) - Core de Offline First
  // ============================================================================

  /**
   * Encola una modificación realizada mientras el usuario estaba offline.
   * Cada operación recibe un UUID único (operation_id) para garantizar IDEMPOTENCIA.
   */
  async enqueueOperation(op) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sync_queue'], 'readwrite');
      const store = tx.objectStore('sync_queue');

      const operationRecord = {
        operation_id: op.operation_id || crypto.randomUUID(), // UUID v4 único
        client_id: this.clientId,                             // Dispositivo que originó el cambio
        entity: op.entity || 'products',                     // Tabla afectada
        record_id: Number(op.record_id),                     // ID del registro
        operation_type: op.operation_type || 'update',       // 'create', 'update', 'delete'
        payload: op.payload,                                 // Datos nuevos
        base_version: Number(op.base_version),               // Versión que el cliente tenía antes de editar
        created_at: op.created_at || new Date().toISOString(),
        status: op.status || 'pending',                      // 'pending', 'conflict', 'applied'
        force: op.force || false
      };

      store.put(operationRecord);

      tx.oncomplete = () => resolve(operationRecord);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene todas las operaciones pendientes de sincronizar con el servidor
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
   * Elimina una operación de la cola una vez que Laravel confirmó que la procesó con éxito
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
   * Actualiza el estado de una operación en cola (ej. marcarla como 'conflict')
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

  // ============================================================================
  // 4. GESTIÓN DE CONFLICTOS (conflicts)
  // ============================================================================

  /**
   * Guarda un conflicto detectado por el backend para resolución en la UI
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
   * Obtiene todos los conflictos no resueltos
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

  // ============================================================================
  // 5. CLIENTES Y PRESUPUESTOS (clients / presupuestos)
  // ============================================================================

  async saveClients(clients) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['clients'], 'readwrite');
      const store = tx.objectStore('clients');
      clients.forEach(c => store.put(c));
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllClients() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['clients'], 'readonly');
      const store = tx.objectStore('clients');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async savePresupuesto(p) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['presupuestos'], 'readwrite');
      const store = tx.objectStore('presupuestos');
      store.put(p);
      tx.oncomplete = () => resolve(p);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllPresupuestos() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['presupuestos'], 'readonly');
      const store = tx.objectStore('presupuestos');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Limpia toda la base de datos local (útil para reiniciar pruebas o cerrar sesión)
   */
  async clearLocalData() {
    await this.init();
    return new Promise((resolve, reject) => {
      const stores = ['products', 'sync_queue', 'conflicts'];
      if (this.db.objectStoreNames.contains('clients')) stores.push('clients');
      if (this.db.objectStoreNames.contains('presupuestos')) stores.push('presupuestos');

      const tx = this.db.transaction(stores, 'readwrite');
      stores.forEach(s => tx.objectStore(s).clear());

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }
}

// Exportamos la clase para su uso global en Vanilla JS
window.LocalDatabase = LocalDatabase;
