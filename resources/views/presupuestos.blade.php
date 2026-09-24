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

  <!-- Scripts Vanilla JS (Sin frameworks) -->
  <script src="/js/db.js?v=7"></script>
  <script src="/js/sync.js?v=7"></script>
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

      // Carga inicial
      refreshStatus();
      await sync.pull();
      await renderBudgets();
    });
  </script>
</body>
</html>
