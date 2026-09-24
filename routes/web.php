<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('app');
});

Route::get('/clientes', function () {
    return view('clientes');
});

Route::get('/presupuestos/crear', function () {
    return view('presupuestos_crear');
});

Route::get('/reportes-servidor', function () {
    return view('reportes_servidor');
});

Route::get('/offline-fallback', function () {
    return view('offline_fallback');
});
