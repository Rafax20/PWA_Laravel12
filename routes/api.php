<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\SyncController;

Route::get('/products', [SyncController::class, 'getProducts']);
Route::get('/clients', [SyncController::class, 'getClients']);
Route::post('/sync/push', [SyncController::class, 'push']);
Route::get('/sync/pull', [SyncController::class, 'pull']);
Route::post('/sync/reset', [SyncController::class, 'resetDemo']);
