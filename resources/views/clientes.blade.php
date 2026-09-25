<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#2563eb">
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
  <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png">
  <link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
  <link rel="shortcut icon" href="/icons/icon-192.png">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <title>Clientes - Sistema de Presupuestos PWA</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>

  <div class="container">
    
    <!-- Encabezado Principal y Estado -->
    <header class="header-box">
      <div class="header-top">
        <h1 class="app-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Directorio de Clientes
        </h1>
        <div class="device-switcher">
          <button id="btn-install-pwa" class="btn btn-sm btn-primary" style="display: none; margin-right: 6px;">
            ⬇ Instalar App
          </button>
          <span>Dispositivo:</span>
          <a id="link-device-a" href="/clientes?device=A" class="device-link">Dispositivo A</a>
          <a id="link-device-b" href="/clientes?device=B" class="device-link">Dispositivo B</a>
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
      </div>
    </header>

    <!-- Navegación Multi-Página de la PWA -->
    <nav class="main-nav">
      <a href="/" class="nav-tab">
        📦 Productos & Sincronización
      </a>
      <a href="/presupuestos" class="nav-tab">
        📋 Historial Presupuestos (Offline)
      </a>
      <a href="/presupuestos/crear" class="nav-tab">
        📝 Crear Presupuesto (Offline)
      </a>
      <a href="/clientes" class="nav-tab active">
        👥 Clientes (Offline)
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
      <button id="btn-sync-clients" class="btn btn-primary">
        ↻ Actualizar Catálogo de Clientes
      </button>
      <button id="btn-add-client-modal" class="btn btn-secondary" style="margin-left: auto;">
        + Nuevo Cliente
      </button>
    </section>

    <!-- Listado de Clientes -->
    <main>
      <div class="section-title">
        <span>Clientes Disponibles (Guardados en IndexedDB Local)</span>
        <small style="color: var(--text-muted); font-size: 0.85rem;">
          Disponibles para consultas y presupuestos incluso sin Internet
        </small>
      </div>

      <div id="clients-container" class="clients-grid">
        <!-- Renderizado dinámico desde IndexedDB -->
      </div>
    </main>

    <!-- Modal Nuevo Cliente -->
    <div id="modal-client" class="modal-overlay">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">Registrar Nuevo Cliente</h3>
          <button id="btn-close-client-modal" class="modal-close">&times;</button>
        </div>
        <form id="form-client" class="modal-body">
          <div class="form-group">
            <label>RIF / Cédula</label>
            <input type="text" id="client-rif" class="form-input" placeholder="Ej: J-12345678-0" required>
          </div>
          <div class="form-group">
            <label>Razón Social / Nombre</label>
            <input type="text" id="client-name" class="form-input" placeholder="Ej: Corporación Andina C.A." required>
          </div>
          <div class="form-group">
            <label>Teléfono</label>
            <input type="text" id="client-phone" class="form-input" placeholder="Ej: 0414-0001122" required>
          </div>
          <div class="form-group">
            <label>Dirección</label>
            <input type="text" id="client-address" class="form-input" placeholder="Ej: Zona Industrial, Galpón 3" required>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 8px;">
            <button type="submit" class="btn btn-primary">Guardar en IndexedDB</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Sección "¿Qué está ocurriendo?" -->
    <section class="explanation-panel">
      <div class="panel-header">
        <h2 class="panel-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          ¿Qué está ocurriendo con los Clientes?
        </h2>
        <button id="btn-clear-logs" class="btn btn-sm btn-secondary">Limpiar Log</button>
      </div>
      <div id="logs-feed" class="logs-feed">
        <!-- Eventos explicativos -->
      </div>
    </section>

  </div>

  <script src="/js/db.js?v=8"></script>
  <script src="/js/sync.js?v=8"></script>
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

      // Mantener dispositivo en enlaces internos
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

      const elLogsFeed = document.getElementById('logs-feed');
      function logActivity(cat, msg) {
        const time = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `<div class="log-header"><span class="badge badge-purple">[${cat}]</span> <span class="log-time">${time}</span></div><div class="log-body">${msg}</div>`;
        if (elLogsFeed) elLogsFeed.prepend(entry);
      }

      const sync = new SyncManager(localDb, async () => {
        refreshStatus();
        await renderClients();
      }, logActivity);

      const elConn = document.getElementById('connection-badge');
      const elBtnToggle = document.getElementById('btn-toggle-offline');
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

      async function renderClients() {
        let clients = await localDb.getAllClients();
        const container = document.getElementById('clients-container');
        container.innerHTML = '';

        if (clients.length === 0) {
          container.innerHTML = '<div class="empty-state">No hay clientes en IndexedDB local. Pulsa "Actualizar Catálogo" para descargarlos de Laravel o crea uno nuevo.</div>';
          return;
        }

        clients.forEach(c => {
          const card = document.createElement('div');
          card.className = 'client-card';
          card.innerHTML = `
            <div class="client-rif">${c.rif}</div>
            <div class="client-name">${c.name}</div>
            <div class="client-detail">📞 ${c.phone}</div>
            <div class="client-detail">📍 ${c.address}</div>
            <span class="badge badge-teal" style="margin-top: 8px; display: inline-block;">Disponible Offline</span>
          `;
          container.appendChild(card);
        });
      }

      async function loadClientsFromServer() {
        if (!sync.isOnline()) {
          logActivity('Offline', 'Dispositivo offline: cargando clientes almacenados en IndexedDB local.');
          await renderClients();
          return;
        }

        try {
          await sync.pull();
        } catch (e) {
          logActivity('Error', 'Fallo al sincronizar con Laravel, usando IndexedDB local.');
        }
        await renderClients();
      }

      document.getElementById('btn-sync-clients').addEventListener('click', async () => {
        await loadClientsFromServer();
      });

      // Modal nuevo cliente
      const modalClient = document.getElementById('modal-client');
      document.getElementById('btn-add-client-modal').addEventListener('click', () => modalClient.classList.add('active'));
      document.getElementById('btn-close-client-modal').addEventListener('click', () => modalClient.classList.remove('active'));

      document.getElementById('form-client').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newClient = {
          id: Date.now(),
          rif: document.getElementById('client-rif').value.trim(),
          name: document.getElementById('client-name').value.trim(),
          phone: document.getElementById('client-phone').value.trim(),
          address: document.getElementById('client-address').value.trim()
        };

        await localDb.saveClients([newClient]);
        logActivity('IndexedDB', `Cliente "${newClient.name}" guardado directamente en IndexedDB local.`);
        modalClient.classList.remove('active');
        document.getElementById('form-client').reset();
        await renderClients();
      });

      document.getElementById('btn-clear-logs').addEventListener('click', () => {
        elLogsFeed.innerHTML = '';
      });

      // Carga inicial (Offline-First):
      refreshStatus();
      // 1. Mostrar inmediatamente los clientes guardados en IndexedDB:
      await renderClients();

      // 2. Traer novedades del servidor en segundo plano si está online:
      if (sync.isOnline()) {
        sync.pull().then(async () => {
          await renderClients();
        });
      }
    });
  </script>
</body>
</html>
