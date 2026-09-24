<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#2563eb">
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
  <title>Crear Presupuesto Offline - PWA</title>
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
          Nuevo Presupuesto (Capacidad Offline)
        </h1>
        <div class="device-switcher">
          <span>Dispositivo:</span>
          <a id="link-device-a" href="/presupuestos/crear?device=A" class="device-link">Dispositivo A</a>
          <a id="link-device-b" href="/presupuestos/crear?device=B" class="device-link">Dispositivo B</a>
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
          <span class="metric-label">Correlativo Asignado</span>
          <span id="correlativo-preview" class="status-badge status-pending">PROVISIONAL (OFFLINE)</span>
        </div>
      </div>
    </header>

    <!-- Navegación Multi-Página de la PWA -->
    <nav class="main-nav">
      <a href="/" class="nav-tab">
        📦 Productos & Sincronización
      </a>
      <a href="/clientes" class="nav-tab">
        👥 Clientes (Offline)
      </a>
      <a href="/presupuestos/crear" class="nav-tab active">
        📝 Crear Presupuesto (Offline)
      </a>
      <a href="/reportes-servidor" class="nav-tab nav-server-only" title="Página que requiere conexión obligatoria">
        🔒 Reportes Servidor (Solo Online)
      </a>
    </nav>

    <!-- Barra de Herramientas -->
    <section class="toolbar">
      <button id="btn-toggle-offline" class="btn btn-secondary">
        ACTIVAR OFFLINE
      </button>
      <button id="btn-sync-now" class="btn btn-primary">
        🔄 Sincronizar con Laravel
      </button>
      <span style="font-size: 0.85rem; color: var(--text-muted); align-self: center;">
        💡 Puedes desconectar internet y el presupuesto se calculará y guardará en IndexedDB con un correlativo provisional.
      </span>
    </section>

    <!-- Formulario de Creación de Presupuesto -->
    <main class="budget-builder">
      <h3 style="margin-bottom: 16px; color: #fff;">Datos del Presupuesto</h3>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px;">
        <div class="form-group">
          <label for="select-client">Cliente (Cargado de IndexedDB local)</label>
          <select id="select-client" class="form-input">
            <option value="">-- Seleccionar Cliente --</option>
          </select>
        </div>

        <div class="form-group">
          <label>Fecha de Emisión</label>
          <input type="text" id="budget-date" class="form-input" readonly>
        </div>
      </div>

      <div class="section-title">
        <span>Agregar Productos / Renglones</span>
      </div>

      <div style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 10px; align-items: flex-end; margin-bottom: 16px; background: #0f172a; padding: 12px; border-radius: 6px;">
        <div class="form-group" style="margin-bottom: 0;">
          <label>Producto (Catálogo Local)</label>
          <select id="select-product" class="form-input">
            <option value="">-- Seleccionar Producto --</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label>Precio Unitario ($)</label>
          <input type="number" id="input-price" class="form-input" readonly placeholder="0.00">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label>Cantidad</label>
          <input type="number" id="input-qty" class="form-input" min="1" value="1">
        </div>
        <button id="btn-add-item" class="btn btn-primary" style="height: 40px;">
          + Agregar
        </button>
      </div>

      <!-- Tabla de Renglones -->
      <table class="items-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Precio Unit.</th>
            <th>Cantidad</th>
            <th>Subtotal</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody id="items-tbody">
          <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted);">
              No se han agregado productos al presupuesto todavía.
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Resumen de Totales Calculados Localmente -->
      <div class="budget-summary">
        <div class="summary-row">
          <span style="color: var(--text-muted);">Subtotal:</span>
          <strong id="summary-subtotal">$0.00</strong>
        </div>
        <div class="summary-row">
          <span style="color: var(--text-muted);">IVA (16%):</span>
          <strong id="summary-tax">$0.00</strong>
        </div>
        <div class="summary-row summary-total">
          <span>Total General:</span>
          <span id="summary-total">$0.00</span>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
        <button id="btn-save-budget" class="btn btn-primary" style="padding: 12px 24px; font-size: 1rem;">
          💾 Guardar Presupuesto Localmente (IndexedDB)
        </button>
      </div>
    </main>

    <!-- Historial de Presupuestos Locales -->
    <section class="explanation-panel">
      <div class="panel-header">
        <h3 class="panel-title">
          📋 Presupuestos Guardados en este Dispositivo
        </h3>
      </div>
      <div id="local-budgets-list" style="display: flex; flex-direction: column; gap: 8px;">
        <!-- Lista de presupuestos -->
      </div>
    </section>

  </div>

  <script src="/js/db.js?v=5"></script>
  <script src="/js/sync.js?v=5"></script>
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

      // Mantener dispositivo en la navegación interna
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

      document.getElementById('budget-date').value = new Date().toLocaleDateString();

      const localDb = new LocalDatabase(clientId);
      await localDb.init();

      const sync = new SyncManager(localDb, async () => {
        refreshStatus();
        await renderSavedBudgets();
      });

      const elConn = document.getElementById('connection-badge');
      const elBtnToggle = document.getElementById('btn-toggle-offline');
      const elBtnSyncNow = document.getElementById('btn-sync-now');

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
        if (!sync.isOnline()) {
          if (confirm('El dispositivo está en modo OFFLINE simulado. ¿Deseas activar la conexión para sincronizar ahora?')) {
            await sync.toggleOfflineSimulation();
          } else {
            return;
          }
        }
        await sync.push();
        await sync.pull();
        await renderSavedBudgets();
        refreshStatus();
      });

      // 1. Cargar Clientes y Productos desde IndexedDB local
      let clients = await localDb.getAllClients();
      if (clients.length === 0) {
        // Sembrar clientes básicos por defecto en IndexedDB si no existían
        const initialClients = [
          { id: 1, rif: 'J-12345678-0', name: 'Inversiones El Sol C.A.', phone: '0414-1112233', address: 'Av. Principal #45' },
          { id: 2, rif: 'J-87654321-9', name: 'Agropecuaria Central S.A.', phone: '0424-5556677', address: 'Calle Comercio #12' },
          { id: 3, rif: 'V-18999888-1', name: 'Distribuidora Juan Pérez', phone: '0412-9998877', address: 'C.C. Las Américas' }
        ];
        await localDb.saveClients(initialClients);
        clients = initialClients;
      }

      const selectClient = document.getElementById('select-client');
      clients.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} (${c.rif})`;
        selectClient.appendChild(opt);
      });

      let products = await localDb.getAllProducts();
      if (products.length === 0) {
        // Fallback básico si aún no se había sincronizado la home
        products = [
          { id: 1, name: 'Producto A', price: 100, version: 1 },
          { id: 2, name: 'Producto B', price: 200, version: 1 },
          { id: 3, name: 'Producto C', price: 300, version: 1 }
        ];
        await localDb.saveProducts(products);
      }

      const selectProduct = document.getElementById('select-product');
      products.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} - $${Number(p.price).toFixed(2)}`;
        selectProduct.appendChild(opt);
      });

      selectProduct.addEventListener('change', () => {
        const prod = products.find(p => p.id == selectProduct.value);
        document.getElementById('input-price').value = prod ? prod.price : '';
      });

      // 2. Gestión reactiva de renglones del presupuesto en memoria local
      let budgetItems = [];

      function updateBudgetSummary() {
        const tbody = document.getElementById('items-tbody');
        tbody.innerHTML = '';

        if (budgetItems.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No se han agregado productos al presupuesto todavía.</td></tr>`;
          document.getElementById('summary-subtotal').textContent = '$0.00';
          document.getElementById('summary-tax').textContent = '$0.00';
          document.getElementById('summary-total').textContent = '$0.00';
          return;
        }

        let subtotal = 0;
        budgetItems.forEach((item, index) => {
          const itemSubtotal = item.price * item.quantity;
          subtotal += itemSubtotal;

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${item.name}</strong></td>
            <td>$${item.price.toFixed(2)}</td>
            <td>${item.quantity}</td>
            <td>$${itemSubtotal.toFixed(2)}</td>
            <td>
              <button class="btn btn-sm btn-danger btn-remove-item" data-index="${index}">&times;</button>
            </td>
          `;
          tbody.appendChild(tr);
        });

        const tax = subtotal * 0.16;
        const total = subtotal + tax;

        document.getElementById('summary-subtotal').textContent = `$${subtotal.toFixed(2)}`;
        document.getElementById('summary-tax').textContent = `$${tax.toFixed(2)}`;
        document.getElementById('summary-total').textContent = `$${total.toFixed(2)}`;

        document.querySelectorAll('.btn-remove-item').forEach(b => {
          b.addEventListener('click', (e) => {
            const idx = b.getAttribute('data-index');
            budgetItems.splice(idx, 1);
            updateBudgetSummary();
          });
        });
      }

      document.getElementById('btn-add-item').addEventListener('click', () => {
        const prodId = selectProduct.value;
        const qty = parseInt(document.getElementById('input-qty').value) || 1;
        if (!prodId) {
          alert('Selecciona un producto del catálogo.');
          return;
        }
        const prod = products.find(p => p.id == prodId);
        budgetItems.push({
          product_id: prod.id,
          name: prod.name,
          price: Number(prod.price),
          quantity: qty
        });

        selectProduct.value = '';
        document.getElementById('input-price').value = '';
        document.getElementById('input-qty').value = '1';
        updateBudgetSummary();
      });

      // 3. Guardar Presupuesto Offline en IndexedDB
      document.getElementById('btn-save-budget').addEventListener('click', async () => {
        const clientIdVal = selectClient.value;
        if (!clientIdVal) {
          alert('Por favor selecciona un cliente para el presupuesto.');
          return;
        }
        if (budgetItems.length === 0) {
          alert('Debes agregar al menos un producto.');
          return;
        }

        const clientObj = clients.find(c => c.id == clientIdVal);
        let subtotal = budgetItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        let tax = subtotal * 0.16;
        let total = subtotal + tax;

        // Generamos correlativo provisional offline:
        const uuid = crypto.randomUUID();
        const correlativoProvisional = `TEMP-${clientId}-${uuid.slice(0, 6).toUpperCase()}`;

        const presupuesto = {
          local_id: uuid,
          correlativo: correlativoProvisional,
          client_id: clientObj.id,
          client_name: clientObj.name,
          items: budgetItems,
          subtotal: subtotal,
          tax: tax,
          total: total,
          status: 'pending_sync',
          created_at: new Date().toISOString()
        };

        // Guardamos en store presupuestos
        await localDb.savePresupuesto(presupuesto);

        // Encolamos en sync_queue
        await localDb.enqueueOperation({
          operation_id: uuid,
          client_id: clientId,
          entity: 'presupuestos',
          record_id: uuid,
          operation_type: 'create_budget',
          payload: presupuesto,
          base_version: 1,
          status: 'pending'
        });

        alert(`✓ Presupuesto guardado exitosamente en IndexedDB local con correlativo provisional: ${correlativoProvisional}.\n\nQueda encolado en sync_queue para enviarse a Laravel.`);

        budgetItems = [];
        updateBudgetSummary();
        selectClient.value = '';
        await renderSavedBudgets();
      });

      async function renderSavedBudgets() {
        const list = await localDb.getAllPresupuestos();
        const container = document.getElementById('local-budgets-list');
        container.innerHTML = '';

        if (list.length === 0) {
          container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem;">Aún no has creado presupuestos en este dispositivo.</div>';
          return;
        }

        list.forEach(b => {
          const isSynced = b.status === 'sincronizado';
          const item = document.createElement('div');
          item.className = 'queue-item-card';
          item.style = 'background: #0f172a; padding: 12px; border-radius: 6px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 8px;';
          item.innerHTML = `
            <div style="flex: 1; min-width: 240px;">
              <span class="badge ${isSynced ? 'badge-green' : 'badge-amber'}">${b.correlativo}</span>
              <strong style="margin-left: 8px; color: #fff;">${b.client_name}</strong>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
                ${b.items.length} productos | Creado: ${new Date(b.created_at).toLocaleTimeString()}
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; text-align: right;">
              <div>
                <span style="font-size: 1.15rem; font-weight: 700; color: #10b981;">$${Number(b.total).toFixed(2)}</span>
                <div style="font-size: 0.75rem; color: ${isSynced ? '#4ade80' : '#fbbf24'}; font-weight: 600;">
                  ${isSynced ? '✓ Sincronizado en Laravel' : '⏳ Pendiente de sincronización'}
                </div>
              </div>
              <div>
                ${isSynced ? `
                  <button class="btn btn-sm btn-secondary btn-test-budget-idempotency" data-id="${b.local_id}" title="Reenviar para probar idempotencia">
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
          container.appendChild(item);
        });

        container.querySelectorAll('.btn-test-budget-idempotency').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const b = list.find(x => x.local_id === id);
            if (b) {
              await sync.testIdempotency(b.local_id, b.local_id, b, 'presupuestos');
            }
          });
        });

        container.querySelectorAll('.btn-sync-single').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!sync.isOnline()) {
              alert('El dispositivo está en modo OFFLINE. Active la conexión para sincronizar.');
              return;
            }
            await sync.push();
            await sync.pull();
            await renderSavedBudgets();
            refreshStatus();
          });
        });
      }

      refreshStatus();
      await renderSavedBudgets();
    });
  </script>
</body>
</html>
