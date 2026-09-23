# PWA Offline & Sincronización con Resolución de Conflictos (Laravel 12 + Vanilla JS)

Demostración funcional y educativa para entender el ciclo de vida de una **PWA Offline**, persistencia local en **IndexedDB**, encolado de operaciones en `sync_queue`, sincronización con **Laravel 12**, **versionado optimista**, **detección/resolución de conflictos** e **idempotencia**.

---

## 1. Diagrama de Flujo de Sincronización

```
  USUARIO
     │  (Edita producto: nombre o precio)
     ▼
    PWA (Blade + Vanilla JS)
     │
     ├── 1. Actualización inmediata de la vista (Optimistic UI)
     │
     ▼
  IndexedDB (Local)
     │
     ├── Guarda copia actualizada en store "products"
     ▼
  Cola Local (sync_queue en IndexedDB)
     │  - operation_id (UUID v4)
     │  - client_id (A o B)
     │  - record_id
     │  - payload { name, price }
     │  - base_version
     │  - status: "pending"
     │
     ▼  ¿Hay conexión con Laravel?
     ├──────────────────────────┐
     │ No (Offline)             │ Sí (Online / Vuelve la red)
     ▼                          ▼
  Permanece retenido       POST /api/sync/push
  en cola local                 │
                                ▼
                           Laravel 12 API
                                │
                                ├── Comprobación de IDEMPOTENCIA
                                │   ¿operation_id ya en processed_operations?
                                │   └─ SÍ ──► Retorna "ALREADY_PROCESSED" (No duplica)
                                │
                                └── Comprobación de VERSIONADO
                                    ¿base_version == product.version?
                                        │
                      ┌─────────────────┴─────────────────┐
                      │ No (Versión desactualizada)       │ Sí (Coincide)
                      ▼                                   ▼
                 ¿CONFLICTO?                         Guardar en SQLite
                      │                              - Aplica payload
                      ▼                              - version = version + 1
                  Retorna CONFLICT                   - Registra processed_operations
              (Datos servidor vs dispositivo)             │
                      │                                   ▼
                      ▼                             Retorna SUCCESS
          Pantalla de Resolución                          │
          [CONSERVAR SERVIDOR]                            ▼
          [USAR CAMBIO DEL DISPOSITIVO]             IndexedDB y UI se actualizan
```

---

## 2. Requisitos Previos

- **PHP**: 8.2 o superior (con extensiones `pdo_sqlite` habilitadas).
- **Composer**: 2.x instalado.

---

## 3. Instalación y Puesta en Marcha

1. **Clonar o ubicarse en la carpeta del proyecto**:
   ```bash
   cd "e:\Escritorio\Laravel12 + React PWA"
   ```

2. **Instalar dependencias de Composer** (si no se han instalado):
   ```bash
   composer install
   ```

3. **Configurar el entorno**:
   Asegúrate de que el archivo `.env` tenga configurado SQLite:
   ```env
   DB_CONNECTION=sqlite
   DB_DATABASE=database/database.sqlite
   ```

4. **Ejecutar migraciones y sembrar datos de prueba**:
   ```bash
   php artisan migrate:fresh --seed
   ```
   *Esto creará automáticamente la base de datos con los 3 productos de prueba iniciales:*
   - **Producto A** - $100.00 (Versión: 1)
   - **Producto B** - $200.00 (Versión: 1)
   - **Producto C** - $300.00 (Versión: 1)

5. **Iniciar el servidor Laravel**:
   ```bash
   php artisan serve --port=8000
   ```

---

## 4. Guía Paso a Paso para la Demostración

### Paso 1: Abrir dos clientes independientes en el navegador
Para simular dos dispositivos físicos que no comparten caché local, el proyecto particiona la base de datos de IndexedDB por el parámetro `?device=X`:

- **Pestaña 1 (Dispositivo A)**:
  👉 [http://localhost:8000/?device=A](http://localhost:8000/?device=A)
- **Pestaña 2 (Dispositivo B)**:
  👉 [http://localhost:8000/?device=B](http://localhost:8000/?device=B)

*En la cabecera verás claramente el identificador de cada dispositivo: `DISPOSITIVO: A` y `DISPOSITIVO: B`.*

Ambos mostrarán los 3 productos en **Versión: 1**.

---

### Paso 2: Simular modo OFFLINE en ambos dispositivos
En la barra de herramientas de **ambas pestañas**, pulsa el botón:
```
[ACTIVAR OFFLINE]
```
- El botón cambiará a rojo `DESACTIVAR OFFLINE`.
- El indicador de estado pasará a `OFFLINE (SIMULADO)`.
- El panel "¿Qué está ocurriendo?" registrará que las peticiones al servidor quedan bloqueadas.

---

### Paso 3: Modificar el mismo producto en ambos dispositivos (Estando Offline)

1. En la pestaña del **Dispositivo A**:
   - En **Producto A**, haz clic en `[Editar]`.
   - Cambia el precio a **`120`**.
   - Haz clic en `[Guardar Cambio]`.
   - **Resultado en A**: El precio local cambia inmediatamente a `$120.00`, el contador muestra `PENDIENTES: 1`, y la sincronización indica `PENDIENTE (1)`. El panel "¿Qué está ocurriendo?" explica que el cambio se guardó en IndexedDB y se encoló en `sync_queue` con versión base 1.

2. En la pestaña del **Dispositivo B**:
   - En **Producto A**, haz clic en `[Editar]`.
   - Cambia el precio a **`150`**.
   - Haz clic en `[Guardar Cambio]`.
   - **Resultado en B**: El precio local cambia inmediatamente a `$150.00`, `PENDIENTES: 1`.

*En este punto, ningún cambio ha llegado a Laravel. Cada cliente tiene su propia versión retenida localmente.*

---

### Paso 4: Sincronizar el Dispositivo A (Gana el primer cambio)

1. En la pestaña del **Dispositivo A**:
   - Haz clic en `[DESACTIVAR OFFLINE]`.
   - Si no sincroniza automáticamente, pulsa `[SINCRONIZAR AHORA]`.
2. **Qué ocurre en Laravel**:
   - Laravel recibe la operación con `base_version = 1`.
   - El servidor compara con la versión actual de la base de datos (versión 1).
   - ¡Coinciden! Laravel acepta el cambio, actualiza el precio a `$120.00` e incrementa la versión a **`2`**.
   - Registra el `operation_id` en `processed_operations`.
   - El Dispositivo A pasa a `SINCRONIZADO`, `PENDIENTES: 0`.

---

### Paso 5: Provocar el Conflicto en el Dispositivo B

1. En la pestaña del **Dispositivo B**:
   - Haz clic en `[DESACTIVAR OFFLINE]`.
   - Pulsa `[SINCRONIZAR AHORA]`.
2. **Qué ocurre en Laravel**:
   - Dispositivo B envía su operación con `base_version = 1`.
   - Pero Laravel actualmente tiene en la base de datos **`versión = 2`** (gracias a A).
   - Laravel detecta la inconsistencia y **NO sobrescribe automáticamente**.
   - Laravel responde con estado **`CONFLICT`**, devolviendo:
     - Versión del servidor: `2` (Precio: $120)
     - Versión base del dispositivo: `1` (Precio propuesto: $150)
3. **Qué ocurre en la interfaz de B**:
   - El badge de sincronización se pone en rojo: **`CONFLICTO (1)`**.
   - Se muestra el botón parpadeante **`⚠ VER CONFLICTOS`**.

---

### Paso 6: Resolver el Conflicto en la Pantalla de B

Al hacer clic en `[VER CONFLICTOS]`, se despliega la pantalla modal:

```
┌────────────────────────────────────────────────────────┐
│ ⚠ CONFLICTO DE SINCRONIZACIÓN                          │
│ Producto: Producto A                                   │
├──────────────────────────┬─────────────────────────────┤
│ Servidor (Laravel)       │ Dispositivo B               │
│ Precio: $120.00          │ Precio propuesto: $150.00   │
│ Versión actual: 2        │ Versión base: 1             │
├──────────────────────────┴─────────────────────────────┤
│  [CONSERVAR SERVIDOR]     [USAR CAMBIO DEL DISPOSITIVO]│
└────────────────────────────────────────────────────────┘
```

- **Si pulsas `[CONSERVAR SERVIDOR]`**:
  Se descarta la modificación local del Dispositivo B, se elimina de `sync_queue`, y la base de datos local IndexedDB adopta los datos del servidor ($120.00, Versión 2).
- **Si pulsas `[USAR CAMBIO DEL DISPOSITIVO]`**:
  El Dispositivo B envía una petición con bandera `force: true`. Laravel adopta el precio de B ($150.00), e incrementa la versión oficial a **`3`**.

---

### Paso 7: Comprobar Idempotencia (Evitar operaciones duplicadas)

1. En cualquiera de los dispositivos, pulsa el botón **`[VER COLA LOCAL]`**.
2. Cada operación tiene un botón **`[Probar Idempotencia (Reenviar)]`**.
3. Al pulsarlo, el cliente reenvía intencionadamente un `operation_id` que ya fue aplicado en Laravel.
4. **Respuesta de Laravel**:
   - Identifica el `operation_id` en la tabla `processed_operations`.
   - Responde: `status: "ALREADY_PROCESSED"`.
   - Mensaje: *"Idempotencia: La operación ya fue procesada anteriormente... No se vuelve a aplicar."*
   - El precio y la versión en la base de datos **no se modifican de nuevo**.

---

## 5. Dónde se Almacena Cada Dato

| Capa | Ubicación | Qué almacena |
|---|---|---|
| **IndexedDB** | Navegador (`pwa_demo_device_A` / `pwa_demo_device_B`) | - `products`: Copia local para visualización sin internet.<br>- `sync_queue`: Operaciones pendientes con UUID, base_version y payload.<br>- `conflicts`: Conflictos no resueltos para mostrar en pantalla. |
| **Service Worker** | Navegador (Cache Storage `pwa-demo-cache-v1`) | Archivos estáticos del App Shell (`index`, CSS, JS, manifest, icono) para abrir la aplicación incluso si el servidor está apagado. |
| **Laravel (Backend)** | Memoria / Request | Validación de idempotencia, cálculo de colisiones y bloqueo optimista. |
| **SQLite** | Servidor (`database/database.sqlite`) | - Tabla `products`: Datos oficiales de la empresa con `version`.<br>- Tabla `processed_operations`: Registro histórico de UUIDs procesados para garantizar idempotencia. |

---

## 6. Estructura de Archivos del Proyecto

```
Laravel 12 + Vanilla JS PWA
├── app/
│   ├── Http/Controllers/
│   │   └── SyncController.php          # API: /products, /sync/push, /sync/pull, /sync/reset
│   └── Models/
│       ├── Product.php                 # Modelo Product con casting de price y version
│       └── ProcessedOperation.php      # Modelo de idempotencia con operation_id único
├── bootstrap/
│   └── app.php                         # Configuración de routing (web + api)
├── database/
│   ├── migrations/
│   │   ├── ..._create_products_table.php            # Migración: id, name, price, version
│   │   └── ..._create_processed_operations_table.php# Migración: operation_id, client_id, processed_at
│   └── seeders/
│       ├── DatabaseSeeder.php          # Ejecuta ProductSeeder
│       └── ProductSeeder.php           # 3 productos iniciales (A $100, B $200, C $300, v1)
├── public/
│   ├── css/
│   │   └── app.css                     # Estilos visuales, badges de estado, modales y feed
│   ├── js/
│   │   ├── db.js                       # Capa IndexedDB particionada por clientId
│   │   ├── sync.js                     # Motor de sincronización, offline y resolución de conflictos
│   │   └── app.js                      # Controlador UI Vanilla JS, modales y panel educativo
│   ├── icons/
│   │   └── icon.svg                    # Icono vectorial PWA
│   ├── manifest.json                   # Manifiesto PWA para instalación y funcionamiento standalone
│   └── sw.js                           # Service Worker para precacheo offline de la aplicación
├── resources/
│   └── views/
│       └── app.blade.php               # Vista principal de la aplicación
└── routes/
    ├── api.php                         # Definición de rutas REST para la sincronización
    └── web.php                         # Retorna la vista app.blade.php
```
