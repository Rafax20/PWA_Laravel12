<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#2563eb">
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
  <title>Historial de Presupuestos - PWA Laravel 12</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>

  <div class="container">
    
    <!-- Encabezado Principal y Estado -->
    <header class="header-box">
      <div class="header-top">
        <h1 class="app-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          Historial de Presupuestos (Catálogo Offline)
        </h1>
        <div class="device-switcher">
          <span>Dispositivo:</span>
          <a id="link-device-a" href="/presupuestos?device=A" class="device-link">Dispositivo A</a>
          <a id="link-device-b" href="/presupuestos?device=B" class="device-link">Dispositivo B</a>
        </div>
      </div>

      <div class="header-metrics">
        <div class="metric-item">
          <span class="metric-label">Dispositivo</span>
          <span style="font-weight: 700; font-size: 1.1rem; color: #38bdf8;">
            DISPOSITIVO: <span id="current-device">A</span>
          </span>
        </div>

        <div class="metric-item">
          <span class="metric-label">Estado de Red</span>
          <span id="connection-badge" class="status-badge status-online">ONLINE</span>
        </div>

        <div class="metric-item">
          <span class="metric-label">Sincronización</span>
          <span id="sync-badge" class="status-badge status-synced">SINCRONIZADO</span>
        </div>

        <div class="metric-item">
          <span class="metric-label">Total Presupuestos</span>
          <span style="font-weight: 700; font-size: 1.1rem; color: #10b981;">
            <span id="total-budgets-count">0</span>
          </span>
        </div>
      </div>
    </header>

    <!-- Navegación Multi-Página de la PWA -->
    <nav class="main-nav">
      <a href="/" class="nav-tab">
        📦 Productos & Sincronización
      </a>
      <a href="/presupuestos" class="nav-tab active">
        📋 Historial Presupuestos (Offline)
      </a>
      <a href="/presupuestos/crear" class="nav-tab">
        📝 Crear Presupuesto (Offline)
      </a>
      <a href="/clientes" class="nav-tab">
        👥 Clientes (Offline)
      </a>
      <a href="/reportes-servidor" class="nav-tab nav-server-only" title="Página que requiere conexión obligatoria">
        🔒 Reportes Servidor (Solo Online)
      </a>
    </nav>

    <!-- Barra de Herramientas y Filtros -->
    <section class="toolbar" style="align-items: center;">
      <button id="btn-toggle-offline" class="btn btn-secondary">
        ACTIVAR OFFLINE
      </button>

      <button id="btn-sync-now" class="btn btn-primary">
        🔄 Sincronizar con Laravel
      </button>

      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-left: 8px;">
        <button id="filter-all" class="btn btn-sm btn-secondary active">Todos (<span id="count-all">0</span>)</button>
        <button id="filter-synced" class="btn btn-sm btn-secondary">Sincronizados (<span id="count-synced">0</span>)</button>
        <button id="filter-pending" class="btn btn-sm btn-secondary">Pendientes (<span id="count-pending">0</span>)</button>
      </div>

      <div style="margin-left: auto; display: flex; gap: 10px; align-items: center;">
        <input type="text" id="input-search" class="form-input" placeholder="🔍 Buscar cliente o correlativo..." style="width: 240px; padding: 6px 12px; font-size: 0.85rem;">
        <a href="/presupuestos/crear" class="btn btn-primary" style="color: #ffffff !important; font-weight: 700;">
          + Crear Nuevo
        </a>
      </div>
    </section>

    <!-- Listado Principal de Presupuestos -->
    <main>
      <div id="budgets-container" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px;">
        <!-- Renderizado dinámico desde IndexedDB -->
      </div>
    </main>

  </div>

  <!-- Modal: Editar Presupuesto (con nuevo operation_id) -->
  <div id="modal-edit-budget" class="modal-overlay">
    <div class="modal-card" style="max-width: 650px;">
      <div class="modal-header">
        <h3 class="modal-title">Editar Presupuesto: <span id="edit-budget-correlativo" style="color: #38bdf8;"></span></h3>
        <button id="btn-close-edit-budget" class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid #3b82f6; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; font-size: 0.85rem; color: #93c5fd;">
          💡 <strong>Regla de Idempotencia y Versión:</strong> Al guardar la edición se generará automáticamente un <strong>nuevo operation_id (UUID v4)</strong> y se incrementará la versión a <strong id="edit-budget-next-version">v2</strong> para que Laravel valide y aplique los cambios sin conflicto.
        </div>

        <div class="form-group">
          <label>Cliente:</label>
          <input type="text" id="edit-budget-client" class="form-input" readonly>
        </div>

        <div class="section-title" style="font-size: 1rem; margin-top: 14px; margin-bottom: 8px;">
          <span>Renglones del Presupuesto</span>
        </div>

        <!-- Agregar producto adicional a la edición -->
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 8px; align-items: flex-end; margin-bottom: 12px; background: #0f172a; padding: 10px; border-radius: 6px;">
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.75rem;">Añadir Producto</label>
            <select id="edit-select-product" class="form-input" style="font-size: 0.85rem; padding: 6px;">
              <option value="">-- Seleccionar --</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.75rem;">Precio ($)</label>
            <input type="number" id="edit-input-price" class="form-input" readonly style="font-size: 0.85rem; padding: 6px;">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.75rem;">Cantidad</label>
            <input type="number" id="edit-input-qty" class="form-input" min="1" value="1" style="font-size: 0.85rem; padding: 6px;">
          </div>
          <button id="btn-edit-add-item" class="btn btn-sm btn-primary" style="height: 34px;">+ Añadir</button>
        </div>

        <!-- Tabla de renglones en edición -->
        <table class="items-table" style="font-size: 0.85rem; margin-bottom: 14px;">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Precio</th>
              <th>Cantidad</th>
              <th>Subtotal</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody id="edit-items-tbody">
            <!-- Items del presupuesto cargados por JS -->
          </tbody>
        </table>

        <!-- Totales recalculados -->
        <div class="budget-summary" style="margin-top: 10px; padding: 12px;">
          <div class="summary-row">
            <span>Subtotal:</span>
            <strong id="edit-summary-subtotal">$0.00</strong>
          </div>
          <div class="summary-row">
            <span>IVA (16%):</span>
            <strong id="edit-summary-tax">$0.00</strong>
          </div>
          <div class="summary-row summary-total">
            <span>Total General:</span>
            <span id="edit-summary-total">$0.00</span>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px;">
          <button id="btn-cancel-edit-budget" class="btn btn-secondary">Cancelar</button>
          <button id="btn-save-edit-budget" class="btn btn-primary" style="color: #fff !important; font-weight: 700;">
            💾 Guardar Edición (Nuevo Operation ID)
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Scripts Vanilla JS (Sin frameworks) -->
  <script src="/js/db.js?v=6"></script>
  <script src="/js/sync.js?v=6"></script>
  <script>
    document.addEventListener('DOMContentLoaded', async () => {
      const urlParams = new URLSearchParams(window.location.search);
      let clientId = urlParams.get('device');
      if (!clientId) {
        clientId = localStorage.getItem('pwa_current_device') || 'A';
      }
      clientId = clientId.toUpperCase();
      localStorage.setItem('pwa_current_device', clientId);

      document.getElementById('current-device').textContent = clientId;
      const linkA = document.getElementById('link-device-a');
      const linkB = document.getElementById('link-device-b');
      if (clientId === 'B') {
        linkB.classList.add('active');
        linkA.classList.remove('active');
      } else {
        linkA.classList.add('active');
        linkB.classList.remove('active');
      }

      // Preservar dispositivo en enlaces
      document.querySelectorAll('a.nav-tab, a.device-link').forEach(link => {
        const url = new URL(link.href, window.location.origin);
        if (link.id === 'link-device-a') {
          url.searchParams.set('device', 'A');
        } else if (link.id === 'link-device-b') {
          url.searchParams.set('device', 'B');
        } else {
          url.searchParams.set('device', clientId);
        }
        link.href = url.pathname + url.search;
      });

      const localDb = new LocalDatabase(clientId);
      await localDb.init();

      const sync = new SyncManager(localDb, async () => {
        refreshStatus();
        await renderBudgets();
      });

      const elConn = document.getElementById('connection-badge');
      const elSyncBadge = document.getElementById('sync-badge');
      const elBtnToggle = document.getElementById('btn-toggle-offline');
      const elBtnSyncNow = document.getElementById('btn-sync-now');
      const elTotalCount = document.getElementById('total-budgets-count');
      const elInputSearch = document.getElementById('input-search');

      let currentFilter = 'all'; // 'all', 'synced', 'pending'
      let currentEditingBudget = null;
      let editingItems = [];
      let catalogProducts = [];

      function refreshStatus() {
        if (sync.isOnline()) {
          elConn.className = 'status-badge status-online';
          elConn.textContent = 'ONLINE';
          elBtnToggle.textContent = 'ACTIVAR OFFLINE';
          elBtnToggle.className = 'btn btn-secondary';
        } else {
          elConn.className = 'status-badge status-offline';
          elConn.textContent = sync.simulatedOffline ? 'OFFLINE (SIMULADO)' : 'OFFLINE (SIN RED)';
          elBtnToggle.textContent = 'DESACTIVAR OFFLINE';
          elBtnToggle.className = 'btn btn-danger';
        }
      }

      elBtnToggle.addEventListener('click', async () => {
        await sync.toggleOfflineSimulation();
        refreshStatus();
      });

      elBtnSyncNow.addEventListener('click', async () => {
        if (sync.simulatedOffline) {
          if (confirm('El dispositivo está en modo OFFLINE simulado. ¿Deseas activar la conexión para sincronizar ahora?')) {
            await sync.toggleOfflineSimulation();
          } else {
            return;
          }
        }
        await sync.push();
        await sync.pull();
        await renderBudgets();
        refreshStatus();
      });

      // Filtros
      const btnFilterAll = document.getElementById('filter-all');
      const btnFilterSynced = document.getElementById('filter-synced');
      const btnFilterPending = document.getElementById('filter-pending');

      [btnFilterAll, btnFilterSynced, btnFilterPending].forEach(btn => {
        btn.addEventListener('click', () => {
          btnFilterAll.classList.remove('active', 'btn-primary');
          btnFilterSynced.classList.remove('active', 'btn-primary');
          btnFilterPending.classList.remove('active', 'btn-primary');
          btnFilterAll.classList.add('btn-secondary');
          btnFilterSynced.classList.add('btn-secondary');
          btnFilterPending.classList.add('btn-secondary');

          btn.classList.add('active', 'btn-primary');
          btn.classList.remove('btn-secondary');

          if (btn === btnFilterAll) currentFilter = 'all';
          if (btn === btnFilterSynced) currentFilter = 'synced';
          if (btn === btnFilterPending) currentFilter = 'pending';
          renderBudgets();
        });
      });

      elInputSearch.addEventListener('input', () => {
        renderBudgets();
      });

      // Cargar catálogo de productos para el modal de edición
      catalogProducts = await localDb.getAllProducts();
      const selectEditProd = document.getElementById('edit-select-product');
      catalogProducts.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} ($${Number(p.price).toFixed(2)})`;
        selectEditProd.appendChild(opt);
      });

      selectEditProd.addEventListener('change', () => {
        const p = catalogProducts.find(x => x.id == selectEditProd.value);
        document.getElementById('edit-input-price').value = p ? p.price : '';
      });

      async function renderBudgets() {
        let list = await localDb.getAllPresupuestos();
        elTotalCount.textContent = list.length;

        // Conteo para los botones de filtro
        document.getElementById('count-all').textContent = list.length;
        document.getElementById('count-synced').textContent = list.filter(b => b.status === 'sincronizado').length;
        document.getElementById('count-pending').textContent = list.filter(b => b.status !== 'sincronizado').length;

        // Cola pendiente
        const queue = await localDb.getQueue();
        const pendingCount = queue.filter(q => q.status === 'pending').length;
        if (pendingCount > 0) {
          elSyncBadge.className = 'status-badge status-pending';
          elSyncBadge.textContent = `PENDIENTE (${pendingCount})`;
        } else {
          elSyncBadge.className = 'status-badge status-synced';
          elSyncBadge.textContent = 'SINCRONIZADO';
        }

        // Ordenar del más reciente al más antiguo
        list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        // Filtro por estado
        if (currentFilter === 'synced') {
          list = list.filter(b => b.status === 'sincronizado');
        } else if (currentFilter === 'pending') {
          list = list.filter(b => b.status !== 'sincronizado');
        }

        // Búsqueda por texto
        const query = elInputSearch.value.trim().toLowerCase();
        if (query) {
          list = list.filter(b => 
            (b.correlativo && b.correlativo.toLowerCase().includes(query)) ||
            (b.client_name && b.client_name.toLowerCase().includes(query))
          );
        }

        const container = document.getElementById('budgets-container');
        container.innerHTML = '';

        if (list.length === 0) {
          container.innerHTML = `
            <div class="empty-state" style="padding: 30px;">
              No se encontraron presupuestos según el criterio de búsqueda o filtro seleccionado.
            </div>
          `;
          return;
        }

        list.forEach(b => {
          const isSynced = b.status === 'sincronizado';
          const card = document.createElement('div');
          card.className = 'queue-item-card';
          card.style = 'padding: 16px; margin-bottom: 12px;';

          const itemsSummary = (b.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ');

          card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; border-bottom: 1px solid var(--border); padding-bottom: 10px; margin-bottom: 12px;">
              <div>
                <span class="badge ${isSynced ? 'badge-green' : 'badge-amber'}" style="font-size: 0.9rem; padding: 4px 8px;">
                  ${b.correlativo}
                </span>
                <span class="version-tag" style="margin-left: 8px;">v${b.version || 1}</span>
                <strong style="margin-left: 10px; color: #fff; font-size: 1.05rem;">${b.client_name}</strong>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 1.4rem; font-weight: 700; color: #10b981;">$${Number(b.total).toFixed(2)}</div>
                <div style="font-size: 0.78rem; color: ${isSynced ? '#4ade80' : '#fbbf24'}; font-weight: 600;">
                  ${isSynced ? '✓ Sincronizado en Servidor Laravel' : '⏳ Pendiente en sync_queue local'}
                </div>
              </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div style="font-size: 0.85rem; color: var(--text-muted); flex: 1; min-width: 250px;">
                <p><strong>Productos:</strong> ${itemsSummary || 'Sin productos registrados'}</p>
                <p style="margin-top: 4px;"><strong>Fecha emisión:</strong> ${new Date(b.created_at || Date.now()).toLocaleString()}</p>
              </div>
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <button class="btn btn-sm btn-secondary btn-open-edit" data-id="${b.local_id}">
                  ✏️ Editar Presupuesto
                </button>
                ${isSynced ? `
                  <button class="btn btn-sm btn-secondary btn-test-idempotency" data-id="${b.local_id}">
                    Probar Idempotencia
                  </button>
                ` : `
                  <button class="btn btn-sm btn-primary btn-sync-single" data-id="${b.local_id}">
                    Sincronizar
                  </button>
                `}
              </div>
            </div>
          `;
          container.appendChild(card);
        });

        // Eventos: Editar
        container.querySelectorAll('.btn-open-edit').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const b = list.find(x => x.local_id === id);
            if (b) openEditModal(b);
          });
        });

        // Eventos: Idempotencia
        container.querySelectorAll('.btn-test-idempotency').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const b = list.find(x => x.local_id === id);
            if (b) {
              await sync.testIdempotency(b.local_id, b.local_id, b, 'presupuestos');
            }
          });
        });

        // Eventos: Sincronizar individual
        container.querySelectorAll('.btn-sync-single').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!sync.isOnline()) {
              alert('El dispositivo está OFFLINE. Active la conexión para enviar cambios.');
              return;
            }
            await sync.push();
            await sync.pull();
            await renderBudgets();
            refreshStatus();
          });
        });
      }

      // Lógica de Modal de Edición de Presupuesto
      const modalEdit = document.getElementById('modal-edit-budget');
      const btnCloseEdit = document.getElementById('btn-close-edit-budget');
      const btnCancelEdit = document.getElementById('btn-cancel-edit-budget');
      const btnSaveEdit = document.getElementById('btn-save-edit-budget');

      function openEditModal(budget) {
        currentEditingBudget = budget;
        editingItems = JSON.parse(JSON.stringify(budget.items || []));

        document.getElementById('edit-budget-correlativo').textContent = budget.correlativo;
        document.getElementById('edit-budget-client').value = budget.client_name;
        document.getElementById('edit-budget-next-version').textContent = `v${(budget.version || 1) + 1}`;

        renderEditItems();
        modalEdit.classList.add('active');
      }

      function renderEditItems() {
        const tbody = document.getElementById('edit-items-tbody');
        tbody.innerHTML = '';

        if (editingItems.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No hay productos en este presupuesto.</td></tr>`;
          document.getElementById('edit-summary-subtotal').textContent = '$0.00';
          document.getElementById('edit-summary-tax').textContent = '$0.00';
          document.getElementById('edit-summary-total').textContent = '$0.00';
          return;
        }

        let subtotal = 0;
        editingItems.forEach((item, index) => {
          const itemSub = item.price * item.quantity;
          subtotal += itemSub;

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${item.name}</strong></td>
            <td>$${Number(item.price).toFixed(2)}</td>
            <td>
              <div style="display: flex; align-items: center; gap: 6px;">
                <button class="btn btn-sm btn-secondary btn-qty-minus" data-idx="${index}" style="padding: 2px 6px;">-</button>
                <span>${item.quantity}</span>
                <button class="btn btn-sm btn-secondary btn-qty-plus" data-idx="${index}" style="padding: 2px 6px;">+</button>
              </div>
            </td>
            <td>$${itemSub.toFixed(2)}</td>
            <td>
              <button class="btn btn-sm btn-danger btn-remove-edit-item" data-idx="${index}">&times;</button>
            </td>
          `;
          tbody.appendChild(tr);
        });

        const tax = subtotal * 0.16;
        const total = subtotal + tax;

        document.getElementById('edit-summary-subtotal').textContent = `$${subtotal.toFixed(2)}`;
        document.getElementById('edit-summary-tax').textContent = `$${tax.toFixed(2)}`;
        document.getElementById('edit-summary-total').textContent = `$${total.toFixed(2)}`;

        // Eventos en renglones
        tbody.querySelectorAll('.btn-qty-minus').forEach(b => {
          b.addEventListener('click', () => {
            const idx = b.getAttribute('data-idx');
            if (editingItems[idx].quantity > 1) {
              editingItems[idx].quantity -= 1;
              renderEditItems();
            }
          });
        });

        tbody.querySelectorAll('.btn-qty-plus').forEach(b => {
          b.addEventListener('click', () => {
            const idx = b.getAttribute('data-idx');
            editingItems[idx].quantity += 1;
            renderEditItems();
          });
        });

        tbody.querySelectorAll('.btn-remove-edit-item').forEach(b => {
          b.addEventListener('click', () => {
            const idx = b.getAttribute('data-idx');
            editingItems.splice(idx, 1);
            renderEditItems();
          });
        });
      }

      document.getElementById('btn-edit-add-item').addEventListener('click', () => {
        const prodId = selectEditProd.value;
        const qty = parseInt(document.getElementById('edit-input-qty').value) || 1;
        if (!prodId) {
          alert('Selecciona un producto para añadir.');
          return;
        }
        const p = catalogProducts.find(x => x.id == prodId);
        editingItems.push({
          product_id: p.id,
          name: p.name,
          price: Number(p.price),
          quantity: qty
        });

        selectEditProd.value = '';
        document.getElementById('edit-input-price').value = '';
        document.getElementById('edit-input-qty').value = '1';
        renderEditItems();
      });

      btnCloseEdit.addEventListener('click', () => modalEdit.classList.remove('active'));
      btnCancelEdit.addEventListener('click', () => modalEdit.classList.remove('active'));

      // Guardar Edición con nuevo operation_id
      btnSaveEdit.addEventListener('click', async () => {
        if (!currentEditingBudget) return;
        if (editingItems.length === 0) {
          alert('El presupuesto debe contener al menos un producto.');
          return;
        }

        const subtotal = editingItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);
        const tax = subtotal * 0.16;
        const total = subtotal + tax;

        // 1. GENERAR NUEVO OPERATION_ID (Clave para Idempotencia en la edición)
        const newOperationId = crypto.randomUUID();
        const newVersion = (currentEditingBudget.version || 1) + 1;

        // 2. Actualizar presupuesto local en IndexedDB
        currentEditingBudget.items = editingItems;
        currentEditingBudget.subtotal = subtotal;
        currentEditingBudget.tax = tax;
        currentEditingBudget.total = total;
        currentEditingBudget.version = newVersion;
        currentEditingBudget.status = 'pending_sync';
        currentEditingBudget.updated_at = new Date().toISOString();

        await localDb.savePresupuesto(currentEditingBudget);

        // 3. Encolar operación de actualización con el nuevo operation_id
        await localDb.enqueueOperation({
          operation_id: newOperationId,
          client_id: clientId,
          entity: 'presupuestos',
          record_id: currentEditingBudget.server_id || currentEditingBudget.local_id,
          operation_type: 'update_budget',
          payload: currentEditingBudget,
          base_version: currentEditingBudget.version,
          status: 'pending',
          created_at: new Date().toISOString()
        });

        modalEdit.classList.remove('active');
        alert(`✓ Presupuesto editado localmente.\n\nSe generó un NUEVO operation_id: ${newOperationId.slice(0, 8)}...\nNueva versión: v${newVersion}\n\nQuedó encolado en sync_queue para sincronizarse con Laravel.`);

        await renderBudgets();

        // 4. Si hay conexión activa, enviarlo de inmediato
        if (sync.isOnline()) {
          await sync.push();
          await sync.pull();
          await renderBudgets();
        }
      });

      // Carga inicial
      refreshStatus();
      await sync.pull();
      await renderBudgets();
    });
  </script>
</body>
</html>
