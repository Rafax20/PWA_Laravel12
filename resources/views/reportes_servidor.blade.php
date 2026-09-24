<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reportes del Servidor (Solo Online) - Laravel 12</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>

  <div class="container">
    
    <header class="header-box">
      <div class="header-top">
        <h1 class="app-title" style="color: #f59e0b;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
            <line x1="6" y1="6" x2="6.01" y2="6"/>
            <line x1="6" y1="18" x2="6.01" y2="18"/>
          </svg>
          Reportes del Servidor Central (En Vivo)
        </h1>
        <span class="badge badge-green">Conexión en Vivo con Laravel</span>
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
      <a href="/clientes" class="nav-tab">
        👥 Clientes (Offline)
      </a>
      <a href="/reportes-servidor" class="nav-tab active nav-server-only">
        🔒 Reportes Servidor (Solo Online)
      </a>
    </nav>

    <main class="budget-builder">
      <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid #f59e0b; padding: 14px; border-radius: 6px; margin-bottom: 20px;">
        <strong style="color: #fbbf24;">⚡ Esta página depende 100% de la conexión con Laravel:</strong>
        <p style="color: #cbd5e1; font-size: 0.9rem; margin-top: 4px;">
          Esta ruta <strong>NO fue guardada en el Service Worker a propósito</strong>. Si activas el modo offline o desconectas tu internet e intentas volver a entrar aquí, comprobarás que el Service Worker te bloqueará el acceso y te mostrará la pantalla de aviso offline.
        </p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
        <div style="background: #0f172a; padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
          <div style="font-size: 0.8rem; color: var(--text-muted);">Servidor Backend</div>
          <div style="font-size: 1.2rem; font-weight: 700; color: #fff;">Laravel 12.x</div>
          <div style="font-size: 0.75rem; color: #10b981; margin-top: 4px;">● Servicio Activo</div>
        </div>

        <div style="background: #0f172a; padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
          <div style="font-size: 0.8rem; color: var(--text-muted);">Hora Actual Servidor</div>
          <div style="font-size: 1.1rem; font-weight: 700; color: #38bdf8;">{{ now()->format('H:i:s d/m/Y') }}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Zona horaria: UTC</div>
        </div>

        <div style="background: #0f172a; padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
          <div style="font-size: 0.8rem; color: var(--text-muted);">Operaciones Procesadas (Idempotencia)</div>
          <div style="font-size: 1.4rem; font-weight: 700; color: #fbbf24;">{{ \App\Models\ProcessedOperation::count() }}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Registros en PostgreSQL / SQLite</div>
        </div>
      </div>
    </main>

  </div>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const urlParams = new URLSearchParams(window.location.search);
      let clientId = urlParams.get('device') || localStorage.getItem('pwa_current_device') || 'A';
      document.querySelectorAll('a.nav-tab').forEach(link => {
        const url = new URL(link.href, window.location.origin);
        url.searchParams.set('device', clientId);
        link.href = url.pathname + url.search;
      });
    });
  </script>
</body>
</html>
