<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#2563eb">
  <meta name="description" content="PWA Offline Demo con Laravel 12, IndexedDB y resolución de conflictos">
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
  <link rel="apple-touch-icon" href="/icons/icon.svg">
  <title>PWA Offline & Sincronización - Laravel 12</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>

  <div class="container">
    
    <!-- Encabezado Principal y Estado -->
    <header class="header-box">
      <div class="header-top">
        <h1 class="app-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          PWA DEMO (Laravel 12)
        </h1>
        <div class="device-switcher">
          <button id="btn-install-pwa-top" class="btn btn-sm btn-primary btn-install-pwa" onclick="window.triggerPwaInstall && window.triggerPwaInstall()" style="margin-right: 6px;">
            📲 Instalar App
          </button>
          <span>Dispositivo actual:</span>
          <a id="link-device-a" href="/?device=A" class="device-link">Dispositivo A</a>
          <a id="link-device-b" href="/?device=B" class="device-link">Dispositivo B</a>
          <a id="link-device-new" href="/?device=B" target="_blank" class="device-link" style="opacity: 0.75; font-size: 0.75rem; margin-left: 4px;" title="Abrir otra ventana separada para simular el otro dispositivo en paralelo">+ Otra Ventana ↗</a>
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
          <span class="metric-label">Estado de Conexión</span>
          <span id="connection-badge" class="status-badge status-online">ONLINE</span>
        </div>

        <div class="metric-item">
          <span class="metric-label">Sincronización</span>
          <span id="sync-badge" class="status-badge status-synced">SINCRONIZADO</span>
        </div>

        <div class="metric-item">
          <span class="metric-label">Pendientes</span>
          <span style="font-weight: 700; font-size: 1.1rem; color: #fbbf24;">
            <span id="pending-count">0</span>
          </span>
        </div>
      </div>
    </header>

    <!-- Navegación Multi-Página de la PWA -->
    <nav class="main-nav">
      <a href="/" class="nav-tab active">
        📦 Productos & Sincronización
      </a>
      <a href="/presupuestos" class="nav-tab">
        📋 Historial Presupuestos (Offline)
      </a>
      <a href="/presupuestos/crear" class="nav-tab">
        📝 Crear Presupuesto (Offline)
      </a>
      <a href="/clientes" class="nav-tab">
        👥 Clientes (Offline)
      </a>
      <a href="/reportes-servidor" class="nav-tab nav-server-only" title="Esta página NO está cacheada por el Service Worker a propósito">
        🔒 Reportes Servidor (Solo Online)
      </a>
    </nav>

    <!-- Barra de Herramientas y Simulación -->
    <section class="toolbar">
      <button id="btn-toggle-offline" class="btn btn-secondary">
        ACTIVAR OFFLINE
      </button>

      <button id="btn-sync-now" class="btn btn-primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
        </svg>
        SINCRONIZAR AHORA
      </button>

      <button id="btn-view-queue" class="btn btn-secondary">
        VER COLA LOCAL
      </button>

      <button id="btn-view-conflicts" class="btn btn-danger" style="display: none;">
        ⚠ VER CONFLICTOS
      </button>

      <button id="btn-install-pwa-main" class="btn btn-primary btn-install-pwa" onclick="window.triggerPwaInstall && window.triggerPwaInstall()" style="color: #fff !important; font-weight: 700; margin-left: auto;">
        📲 Instalar App
      </button>

      <button id="btn-reset-demo" class="btn btn-secondary">
        ↺ Reiniciar Demo
      </button>
    </section>

    <!-- Lista de Productos -->
    <main>
      <div class="section-title">
        <span>Productos Disponibles</span>
        <small style="font-size: 0.8rem; font-weight: normal; color: var(--text-muted);">
          Persistidos en IndexedDB local & Servidor SQLite
        </small>
      </div>

      <div id="product-list" class="product-list">
        <!-- Renderizado dinámico desde IndexedDB por app.js -->
      </div>
    </main>

    <!-- Sección de Presupuestos Recientes (Buffer FIFO: Últimos 5) -->
    <section style="margin-bottom: 28px;">
      <div class="section-title">
        <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;">
          <span>Presupuestos Recientes</span>
          <small id="fifo-counter" style="color: var(--text-muted); font-size: 0.8rem;">
            (Buffer FIFO: Últimos 5 más recientes)
          </small>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <a href="/presupuestos" class="btn btn-sm btn-secondary" style="color: #fff;">
            📋 Ver Historial Completo ↗
          </a>
          <a href="/presupuestos/crear" class="btn btn-sm btn-primary" style="color: #ffffff !important; font-weight: 700;">
            + Crear Nuevo Presupuesto
          </a>
        </div>
      </div>
      <div id="dashboard-budgets-list" style="display: flex; flex-direction: column; gap: 10px;">
        <!-- Renderizado dinámico de los últimos 5 desde IndexedDB por app.js -->
      </div>
      <div id="fifo-footer" style="display: none; text-align: center; padding: 8px; font-size: 0.85rem; color: var(--text-muted); background: rgba(15, 23, 42, 0.5); border-radius: 6px; margin-top: 8px; border: 1px dashed var(--border);">
        ℹ Mostrando únicamente los 5 presupuestos más recientes para optimizar el espacio visual de esta pantalla.
        <a href="/presupuestos" style="color: #38bdf8; text-decoration: underline; margin-left: 6px;">Ver todos los presupuestos aquí ↗</a>
      </div>
    </section>

    <!-- Sección Educativa en Tiempo Real: "¿Qué está ocurriendo?" -->
    <section class="explanation-panel">
      <div class="panel-header">
        <h2 class="panel-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          ¿Qué está ocurriendo? (Explicación en tiempo real)
        </h2>
        <button id="btn-clear-logs" class="btn btn-sm btn-secondary">Limpiar Log</button>
      </div>
      <div id="logs-feed" class="logs-feed">
        <!-- Eventos explicativos añadidos dinámicamente -->
      </div>
    </section>

  </div>

  <!-- Modal: Editar Producto -->
  <div id="modal-edit" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-title">Editar Producto</h3>
        <button id="btn-close-edit" class="modal-close">&times;</button>
      </div>
      <form id="form-edit" class="modal-body">
        <input type="hidden" id="edit-product-id">
        <input type="hidden" id="edit-product-version">

        <div class="form-group">
          <label for="edit-product-name">Nombre del Producto</label>
          <input type="text" id="edit-product-name" class="form-input" required>
        </div>

        <div class="form-group">
          <label for="edit-product-price">Precio ($)</label>
          <input type="number" id="edit-product-price" class="form-input" step="0.01" required>
        </div>

        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 16px;">
          Versión base registrada: <strong id="modal-edit-version-label" style="color: #38bdf8;">1</strong>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button type="submit" class="btn btn-primary" style="color: #fff !important;">Guardar Cambio</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal: Cola Local (sync_queue) -->
  <div id="modal-queue" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-title">Cola Local de Operaciones (sync_queue)</h3>
        <button id="btn-close-queue" class="modal-close">&times;</button>
      </div>
      <div class="modal-body" id="queue-content">
        <!-- Operaciones listadas por JS -->
      </div>
    </div>
  </div>

  <!-- Modal: Conflictos de Sincronización -->
  <div id="modal-conflict" class="modal-overlay">
    <div class="modal-card" style="max-width: 600px;">
      <div class="modal-header">
        <h3 class="modal-title" style="color: #f87171;">Resolución de Conflicto</h3>
        <button id="btn-close-conflict" class="modal-close">&times;</button>
      </div>
      <div class="modal-body" id="conflict-content">
        <!-- Tarjetas de conflicto listadas por JS -->
      </div>
    </div>
  </div>

  <!-- Scripts Vanilla JS (Sin frameworks) -->
  <script src="/js/db.js?v=8"></script>
  <script src="/js/sync.js?v=8"></script>
  <script src="/js/app.js?v=8"></script>
</body>
</html>
