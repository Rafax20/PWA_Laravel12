<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Página no disponible Offline - PWA</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>

  <div class="container">
    
    <div class="offline-fallback-card">
      <svg class="offline-fallback-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
        <line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>

      <h2 class="offline-fallback-title">Sección no disponible sin conexión</h2>
      
      <p class="offline-fallback-desc">
        La página que intentas abrir (como <strong>Reportes del Servidor</strong>) requiere una conexión activa en tiempo real con Laravel y la base de datos central.
        <br><br>
        Esta página <strong>no fue guardada en el Service Worker a propósito</strong> para demostrar cómo la PWA bloquea de forma segura las funciones que no pueden trabajar desconectadas.
      </p>

      <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
        <a href="/" class="btn btn-primary">
          📦 Volver a Productos (Offline OK)
        </a>
        <a href="/presupuestos/crear" class="btn btn-secondary">
          📝 Crear Presupuesto (Offline OK)
        </a>
        <a href="/clientes" class="btn btn-secondary">
          👥 Ver Clientes (Offline OK)
        </a>
      </div>
    </div>

  </div>

</body>
</html>
