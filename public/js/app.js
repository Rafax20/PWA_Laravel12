/**
 * app.js - Controlador principal de la interfaz Vanilla JS
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Obtener el identificador del dispositivo (A o B) y persistirlo
  const urlParams = new URLSearchParams(window.location.search);
  let clientId = urlParams.get('device');
  if (!clientId) {
    clientId = localStorage.getItem('pwa_current_device') || 'A';
  }
  clientId = clientId.toUpperCase();
  localStorage.setItem('pwa_current_device', clientId);

  // Asegurar que todos los enlaces de navegación y cambio de dispositivo mantengan ?device=
  document.querySelectorAll('a.nav-tab, a.device-link').forEach(link => {
    const url = new URL(link.href, window.location.origin);
    if (link.id === 'link-device-a') {
      url.searchParams.set('device', 'A');
    } else if (link.id === 'link-device-b') {
      url.searchParams.set('device', 'B');
    } else if (link.id === 'link-device-new') {
      url.searchParams.set('device', clientId === 'A' ? 'B' : 'A');
    } else {
      url.searchParams.set('device', clientId);
    }
    link.href = url.pathname + url.search;
  });

  // 2. Elementos del DOM
  const elCurrentDevice = document.getElementById('current-device');
  const elConnectionBadge = document.getElementById('connection-badge');
  const elSyncBadge = document.getElementById('sync-badge');
  const elPendingCount = document.getElementById('pending-count');
  const elBtnToggleOffline = document.getElementById('btn-toggle-offline');
  const elBtnSyncNow = document.getElementById('btn-sync-now');
  const elBtnViewQueue = document.getElementById('btn-view-queue');
  const elBtnViewConflicts = document.getElementById('btn-view-conflicts');
  const elBtnResetDemo = document.getElementById('btn-reset-demo');
  const elProductList = document.getElementById('product-list');
  const elDashboardBudgetsList = document.getElementById('dashboard-budgets-list');
  const elLogsFeed = document.getElementById('logs-feed');
  const elBtnClearLogs = document.getElementById('btn-clear-logs');

  // Modales
  const elModalEdit = document.getElementById('modal-edit');
  const elFormEdit = document.getElementById('form-edit');
  const elEditId = document.getElementById('edit-product-id');
  const elEditName = document.getElementById('edit-product-name');
  const elEditPrice = document.getElementById('edit-product-price');
  const elEditVersion = document.getElementById('edit-product-version');
  const elBtnCloseEdit = document.getElementById('btn-close-edit');

  const elModalQueue = document.getElementById('modal-queue');
  const elQueueContent = document.getElementById('queue-content');
  const elBtnCloseQueue = document.getElementById('btn-close-queue');

  const elModalConflict = document.getElementById('modal-conflict');
  const elConflictContent = document.getElementById('conflict-content');
  const elBtnCloseConflict = document.getElementById('btn-close-conflict');

  // 3. Inicializar Base de Datos local (IndexedDB) particionada por clientId
  const localDb = new LocalDatabase(clientId);
  await localDb.init();

  // 4. Registro del Service Worker
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      console.log('[PWA] Service Worker registrado con scope:', reg.scope);
      logActivity('PWA', `Service Worker activo y registrado. Scope: ${reg.scope}`);
    } catch (e) {
      console.warn('[PWA] Error al registrar Service Worker:', e);
      logActivity('PWA', `Error al registrar Service Worker: ${e.message}`);
    }
  }

  // 4.1 Soporte para instalación como aplicación (PWA Install Prompt)
  let deferredPrompt = null;
  const elBtnInstallPwa = document.getElementById('btn-install-pwa');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (elBtnInstallPwa) {
      elBtnInstallPwa.style.display = 'inline-flex';
    }
    logActivity('PWA', 'La aplicación está lista para instalarse como PWA en Chrome / Edge.');
  });

  if (elBtnInstallPwa) {
    elBtnInstallPwa.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        logActivity('PWA', `Respuesta del usuario a la instalación: ${outcome}`);
        deferredPrompt = null;
        elBtnInstallPwa.style.display = 'none';
      }
    });
  }

  window.addEventListener('appinstalled', () => {
    logActivity('PWA', '✓ Aplicación PWA instalada exitosamente.');
    if (elBtnInstallPwa) elBtnInstallPwa.style.display = 'none';
  });

  // 5. Función de Logging Educativo ("¿Qué está ocurriendo?")
  function logActivity(category, message, details = null) {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry log-cat-${category.toLowerCase().replace(/\s+/g, '-')}`;

    let categoryClass = 'badge-default';
    if (category === 'IndexedDB') categoryClass = 'badge-purple';
    if (category === 'Red') categoryClass = 'badge-blue';
    if (category === 'Laravel API') categoryClass = 'badge-green';
    if (category === 'Conflicto') categoryClass = 'badge-red';
    if (category === 'Idempotencia') categoryClass = 'badge-amber';
    if (category === 'Offline' || category === 'Simulación') categoryClass = 'badge-orange';
    if (category === 'Resolución') categoryClass = 'badge-teal';

    let detailsHtml = '';
    if (details) {
      detailsHtml = `<pre class="log-details">${JSON.stringify(details, null, 2)}</pre>`;
    }

    entry.innerHTML = `
      <div class="log-header">
        <span class="badge ${categoryClass}">[${category}]</span>
        <span class="log-time">${time}</span>
      </div>
      <div class="log-body">${message}</div>
      ${detailsHtml}
    `;

    elLogsFeed.prepend(entry);

    while (elLogsFeed.children.length > 50) {
      elLogsFeed.removeChild(elLogsFeed.lastChild);
    }
  }

  // 6. Inicializar Gestor de Sincronización
  const sync = new SyncManager(localDb, refreshUI, logActivity);

  // 7. Función principal de refresco de interfaz (renderizado reactivo Vanilla)
  async function refreshUI() {
    // A. Identificador de dispositivo y selector visual de botones
    elCurrentDevice.textContent = clientId;
    const linkA = document.getElementById('link-device-a');
    const linkB = document.getElementById('link-device-b');
    const linkNew = document.getElementById('link-device-new');
    if (linkA && linkB) {
      if (clientId === 'B') {
        linkB.classList.add('active');
        linkA.classList.remove('active');
        if (linkNew) {
          linkNew.href = '/?device=A';
          linkNew.textContent = '+ Abrir Disp. A en otra ventana ↗';
        }
      } else {
        linkA.classList.add('active');
        linkB.classList.remove('active');
        if (linkNew) {
          linkNew.href = '/?device=B';
          linkNew.textContent = '+ Abrir Disp. B en otra ventana ↗';
        }
      }
    }

    // B. Estado de conexión
    const isOnline = sync.isOnline();
    if (isOnline) {
      elConnectionBadge.className = 'status-badge status-online';
      elConnectionBadge.textContent = 'ONLINE';
    } else {
      elConnectionBadge.className = 'status-badge status-offline';
      elConnectionBadge.textContent = sync.simulatedOffline ? 'OFFLINE (SIMULADO)' : 'OFFLINE (SIN RED)';
    }

    // Texto del botón toggle
    if (sync.simulatedOffline) {
      elBtnToggleOffline.textContent = 'DESACTIVAR OFFLINE';
      elBtnToggleOffline.classList.add('btn-danger');
      elBtnToggleOffline.classList.remove('btn-secondary');
    } else {
      elBtnToggleOffline.textContent = 'ACTIVAR OFFLINE';
      elBtnToggleOffline.classList.remove('btn-danger');
      elBtnToggleOffline.classList.add('btn-secondary');
    }

    // C. Operaciones en cola y Conflictos
    const queue = await localDb.getQueue();
    const conflicts = await localDb.getConflicts();
    const pendingCount = queue.filter(q => q.status === 'pending').length;
    const conflictCount = conflicts.length;

    elPendingCount.textContent = pendingCount;

    // D. Badge de Sincronización
    if (conflictCount > 0) {
      elSyncBadge.className = 'status-badge status-conflict';
      elSyncBadge.textContent = `CONFLICTO (${conflictCount})`;
      elBtnViewConflicts.classList.add('btn-highlight-pulse');
      elBtnViewConflicts.style.display = 'inline-block';
    } else if (pendingCount > 0) {
      elSyncBadge.className = 'status-badge status-pending';
      elSyncBadge.textContent = `PENDIENTE (${pendingCount})`;
      elBtnViewConflicts.classList.remove('btn-highlight-pulse');
      elBtnViewConflicts.style.display = 'none';
    } else {
      elSyncBadge.className = 'status-badge status-synced';
      elSyncBadge.textContent = 'SINCRONIZADO';
      elBtnViewConflicts.classList.remove('btn-highlight-pulse');
      elBtnViewConflicts.style.display = 'none';
    }

    // E. Lista de productos desde IndexedDB
    const products = await localDb.getAllProducts();
    renderProducts(products);

    // F. Lista de presupuestos guardados en este dispositivo
    await renderBudgets();

    // G. Si hay conflictos y el modal está abierto, refrescarlo
    if (conflictCount > 0 && elModalConflict.classList.contains('active')) {
      renderConflictModal(conflicts);
    }
  }

  // 8. Renderizado del listado de productos
  function renderProducts(products) {
    elProductList.innerHTML = '';

    if (products.length === 0) {
      elProductList.innerHTML = `<div class="empty-state">No hay productos en la base de datos local. Haz clic en "Sincronizar Ahora" o "Reiniciar Demo".</div>`;
      return;
    }

    products.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <div class="product-info">
          <div class="product-title-row">
            <h3 class="product-name">${p.name}</h3>
            <span class="version-tag">Versión: <strong>${p.version}</strong></span>
          </div>
          <div class="product-price">$${Number(p.price).toFixed(2)}</div>
        </div>
        <div class="product-actions">
          <button class="btn btn-sm btn-primary btn-edit-product" data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-version="${p.version}">
            Editar
          </button>
        </div>
      `;
      elProductList.appendChild(card);
    });

    // Asignar eventos de edición
    document.querySelectorAll('.btn-edit-product').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const price = btn.getAttribute('data-price');
        const version = btn.getAttribute('data-version');

        elEditId.value = id;
        elEditName.value = name;
        elEditPrice.value = price;
        elEditVersion.value = version;
        document.getElementById('modal-edit-version-label').textContent = version;

        elModalEdit.classList.add('active');
      });
    });
  }

  // 8.1 Renderizado de Presupuestos Locales en el Dashboard
  async function renderBudgets() {
    if (!elDashboardBudgetsList) return;

    const budgets = await localDb.getAllPresupuestos();
    elDashboardBudgetsList.innerHTML = '';

    if (budgets.length === 0) {
      elDashboardBudgetsList.innerHTML = `
        <div class="empty-state" style="padding: 16px; font-size: 0.9rem;">
          No hay presupuestos registrados en este dispositivo todavía. Puedes generar presupuestos con correlativo provisional en modo offline pulsando en <strong>"+ Crear Nuevo Presupuesto"</strong>.
        </div>
      `;
      return;
    }

    budgets.forEach((b) => {
      const isSynced = b.status === 'sincronizado';
      const item = document.createElement('div');
      item.className = 'queue-item-card';
      item.style = 'display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;';
      item.innerHTML = `
        <div style="flex: 1; min-width: 240px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge ${isSynced ? 'badge-green' : 'badge-amber'}">${b.correlativo}</span>
            <strong style="color: #fff; font-size: 0.95rem;">${b.client_name}</strong>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
            ${(b.items || []).length} productos en lista | Creado: ${new Date(b.created_at || Date.now()).toLocaleTimeString()}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 14px; text-align: right; flex-wrap: wrap;">
          <div>
            <div style="font-size: 1.2rem; font-weight: 700; color: #10b981;">$${Number(b.total).toFixed(2)}</div>
            <div style="font-size: 0.75rem; color: ${isSynced ? '#4ade80' : '#fbbf24'}; font-weight: 600;">
              ${isSynced ? '✓ Sincronizado en Laravel' : '⏳ Pendiente en sync_queue'}
            </div>
          </div>
          <div>
            ${isSynced ? `
              <button class="btn btn-sm btn-secondary btn-test-budget-idempotency" data-id="${b.local_id}" title="Reenvía el presupuesto para comprobar que Laravel no lo duplica">
                Probar Idempotencia
              </button>
            ` : `
              <button class="btn btn-sm btn-primary btn-sync-budget-inline" title="Sincronizar este presupuesto pendiente con Laravel">
                Sincronizar Ahora
              </button>
            `}
          </div>
        </div>
      `;
      elDashboardBudgetsList.appendChild(item);
    });

    // Botones para probar idempotencia
    elDashboardBudgetsList.querySelectorAll('.btn-test-budget-idempotency').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const b = budgets.find(x => x.local_id === id);
        if (b) {
          await sync.testIdempotency(b.local_id, b.local_id, b, 'presupuestos');
        }
      });
    });

    // Botones para sincronizar de inmediato
    elDashboardBudgetsList.querySelectorAll('.btn-sync-budget-inline').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!sync.isOnline()) {
          alert('El dispositivo está en modo OFFLINE. Active la conexión para enviar los presupuestos pendientes.');
          return;
        }
        await sync.push();
        await sync.pull();
        await refreshUI();
      });
    });
  }

  // 9. Guardar edición de producto
  elFormEdit.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = Number(elEditId.value);
    const name = elEditName.value.trim();
    const price = parseFloat(elEditPrice.value);
    const baseVersion = Number(elEditVersion.value);

    elModalEdit.classList.remove('active');

    // 1. Generamos operation_id como UUID v4
    const operationId = crypto.randomUUID();

    // 2. Guardamos cambio en IndexedDB inmediatamente (Optimistic UI)
    await localDb.updateProduct({
      id: id,
      name: name,
      price: price,
      version: baseVersion
    });

    // 3. Encolamos la operación en sync_queue
    const op = {
      operation_id: operationId,
      client_id: clientId,
      entity: 'products',
      record_id: id,
      operation_type: 'update',
      payload: { name, price },
      base_version: baseVersion,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    await localDb.enqueueOperation(op);

    logActivity('IndexedDB', `Cambio guardado localmente en IndexedDB. Encolada operación en sync_queue (base_version: ${baseVersion}).`, {
      operacion_id: operationId,
      dispositivo: clientId,
      producto_id: id,
      nuevo_precio: price,
      version_base: baseVersion
    });

    await refreshUI();

    // 4. Si el dispositivo está online, intentamos sincronizar de inmediato
    if (sync.isOnline()) {
      await sync.push();
      await refreshUI();
    } else {
      logActivity('Offline', `El dispositivo ${clientId} está OFFLINE. El cambio NO se envió a Laravel. Queda retenido en cola local.`);
    }
  });

  // 10. Botones de control
  elBtnToggleOffline.addEventListener('click', async () => {
    await sync.toggleOfflineSimulation();
    await refreshUI();
  });

  elBtnSyncNow.addEventListener('click', async () => {
    if (sync.simulatedOffline) {
      await sync.toggleOfflineSimulation();
    }
    logActivity('Sincronización', 'Sincronización manual solicitada con el servidor Laravel...');
    await refreshUI();
    await sync.push();
    await sync.pull();
    await refreshUI();
  });

  // Modal Cola Local (sync_queue) con soporte completo para Presupuestos y Productos
  elBtnViewQueue.addEventListener('click', async () => {
    const queue = await localDb.getQueue();
    elQueueContent.innerHTML = '';

    if (queue.length === 0) {
      elQueueContent.innerHTML = '<div class="empty-state">La cola local de sincronización está vacía. Todos los cambios están al día con Laravel.</div>';
    } else {
      queue.forEach((op) => {
        const isBudget = op.entity === 'presupuestos' || op.operation_type === 'create_budget';
        const item = document.createElement('div');
        item.className = 'queue-item-card';
        item.innerHTML = `
          <div class="queue-item-header">
            <strong>Operación: ${op.operation_id.slice(0, 13)}...</strong>
            <span class="badge ${op.status === 'conflict' ? 'badge-red' : 'badge-orange'}">${op.status.toUpperCase()}</span>
          </div>
          <div class="queue-item-details">
            <p><strong>Tipo:</strong> ${isBudget ? '📝 Presupuesto (Creación)' : '📦 Producto (Actualización)'}</p>
            <p><strong>Dispositivo emisor:</strong> ${op.client_id}</p>
            <p><strong>${isBudget ? 'Correlativo Temp:' : 'Producto ID:'}</strong> ${isBudget ? (op.payload.correlativo || op.record_id) : op.record_id}</p>
            ${isBudget ? `
              <p><strong>Cliente:</strong> ${op.payload.client_name || 'N/A'}</p>
              <p><strong>Total calculado:</strong> $${Number(op.payload.total || 0).toFixed(2)}</p>
            ` : `
              <p><strong>Versión Base enviada:</strong> ${op.base_version}</p>
              <p><strong>Nuevo Precio propuesto:</strong> $${Number(op.payload.price || 0).toFixed(2)}</p>
            `}
            <p><strong>Fecha encolado:</strong> ${new Date(op.created_at).toLocaleString()}</p>
            <p><strong>Payload inspección:</strong></p>
            <div class="payload-preview">${JSON.stringify(op.payload, null, 2)}</div>
          </div>
          <div style="margin-top: 10px;">
            <button class="btn btn-sm btn-secondary btn-test-idempotency" data-opid="${op.operation_id}" data-recid="${op.record_id}" data-entity="${op.entity || (isBudget ? 'presupuestos' : 'products')}" data-payload='${JSON.stringify(op.payload).replace(/'/g, "&apos;")}'>
              Probar Idempotencia (Reenviar)
            </button>
          </div>
        `;
        elQueueContent.appendChild(item);
      });

      // Prueba de idempotencia manual
      document.querySelectorAll('.btn-test-idempotency').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const opId = btn.getAttribute('data-opid');
          const recId = btn.getAttribute('data-recid');
          const entity = btn.getAttribute('data-entity') || 'products';
          let payload = {};
          try {
            payload = JSON.parse(btn.getAttribute('data-payload'));
          } catch(e) {
            console.error('Error parseando payload para idempotencia', e);
          }
          await sync.testIdempotency(opId, recId, payload, entity);
        });
      });
    }

    elModalQueue.classList.add('active');
  });

  // Modal Conflictos
  function renderConflictModal(conflicts) {
    elConflictContent.innerHTML = '';
    if (conflicts.length === 0) {
      elConflictContent.innerHTML = '<div class="empty-state">No hay conflictos pendientes. ¡Todo en orden!</div>';
      return;
    }

    conflicts.forEach((c) => {
      const card = document.createElement('div');
      card.className = 'conflict-box';
      card.innerHTML = `
        <div class="conflict-header-title">
          <h4>⚠ CONFLICTO DE SINCRONIZACIÓN</h4>
          <span>Producto: <strong>${c.server_data.name}</strong></span>
        </div>
        <div class="conflict-comparison">
          <div class="conflict-side conflict-server">
            <h5>Servidor (Laravel)</h5>
            <p><strong>Precio:</strong> $${c.server_data.price.toFixed(2)}</p>
            <p><strong>Versión actual:</strong> ${c.server_version}</p>
          </div>
          <div class="conflict-side conflict-device">
            <h5>Dispositivo ${c.client_id}</h5>
            <p><strong>Precio propuesto:</strong> $${Number(c.device_payload.price).toFixed(2)}</p>
            <p><strong>Versión base:</strong> ${c.base_version}</p>
          </div>
        </div>
        <div class="conflict-actions">
          <button class="btn btn-secondary btn-keep-server" data-opid="${c.operation_id}">
            [CONSERVAR SERVIDOR]
          </button>
          <button class="btn btn-danger btn-use-device" data-opid="${c.operation_id}">
            [USAR CAMBIO DEL DISPOSITIVO]
          </button>
        </div>
      `;
      elConflictContent.appendChild(card);
    });

    // Eventos de resolución
    document.querySelectorAll('.btn-keep-server').forEach((b) => {
      b.addEventListener('click', async () => {
        const opId = b.getAttribute('data-opid');
        await sync.resolveConflict(opId, 'keep_server');
        elModalConflict.classList.remove('active');
        await refreshUI();
      });
    });

    document.querySelectorAll('.btn-use-device').forEach((b) => {
      b.addEventListener('click', async () => {
        const opId = b.getAttribute('data-opid');
        await sync.resolveConflict(opId, 'use_device');
        elModalConflict.classList.remove('active');
        await refreshUI();
      });
    });
  }

  elBtnViewConflicts.addEventListener('click', async () => {
    const conflicts = await localDb.getConflicts();
    renderConflictModal(conflicts);
    elModalConflict.classList.add('active');
  });

  // Botón Reiniciar Demo
  elBtnResetDemo.addEventListener('click', async () => {
    if (!confirm('¿Deseas reiniciar la base de datos de Laravel y la caché local de este dispositivo a los valores iniciales?')) return;

    try {
      logActivity('Laravel API', 'Reiniciando base de datos del servidor a valores iniciales...');
      const res = await fetch('/api/sync/reset', { method: 'POST', headers: { 'Accept': 'application/json' } });
      const data = await res.json();

      await localDb.clearLocalData();
      localStorage.removeItem(`pwa_simulated_offline_${clientId}`);
      sync.simulatedOffline = false;

      if (data.products) {
        await localDb.saveProducts(data.products);
      }

      logActivity('Sincronización', 'Valores de demostración restaurados: Productos A, B, C creados y presupuestos reseteados.');
      await refreshUI();
    } catch (err) {
      logActivity('Error', `Error al reiniciar demo: ${err.message}`);
    }
  });

  // Cerrar Modales
  elBtnCloseEdit.addEventListener('click', () => elModalEdit.classList.remove('active'));
  elBtnCloseQueue.addEventListener('click', () => elModalQueue.classList.remove('active'));
  elBtnCloseConflict.addEventListener('click', () => elModalConflict.classList.remove('active'));

  elBtnClearLogs.addEventListener('click', () => {
    elLogsFeed.innerHTML = '';
  });

  // Carga inicial:
  logActivity('IndexedDB', `Iniciando PWA para DISPOSITIVO: ${clientId}. Base de datos local: pwa_demo_device_${clientId}`);
  await sync.pull();
  await refreshUI();
});
