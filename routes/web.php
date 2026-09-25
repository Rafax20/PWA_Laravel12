<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| RUTAS WEB PRINCIPALES - PWA OFFLINE DEMO
|--------------------------------------------------------------------------
| Cada una de estas rutas sirve una vista Blade estática o dinámica.
| El Service Worker (public/sw.js) pre-cachea las vistas para que sigan
| funcionando incluso si el dispositivo se queda sin conexión a internet.
*/

// 1. Dashboard Principal y Catálogo de Productos (Precacheado en sw.js)
Route::get('/', function () {
    return view('app');
});

// 2. Directorio de Clientes (Precacheado en sw.js)
Route::get('/clientes', function () {
    return view('clientes');
});

// 3. Historial de Presupuestos (Precacheado en sw.js)
Route::get('/presupuestos', function () {
    return view('presupuestos');
});

// 4. Formulario de Creación de Presupuestos Offline (Precacheado en sw.js)
Route::get('/presupuestos/crear', function () {
    return view('presupuestos_crear');
});

// 5. Ruta Exclusiva Online: Demuestra el comportamiento cuando una página NO se cachea
Route::get('/reportes-servidor', function () {
    return view('reportes_servidor');
});

// 6. Vista de Respaldo Offline: El Service Worker la entrega automáticamente cuando
// el usuario intenta entrar a una página no cacheada (ej. /reportes-servidor) sin internet.
Route::get('/offline-fallback', function () {
    return view('offline_fallback');
});
