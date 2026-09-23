<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\ProcessedOperation;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class SyncController extends Controller
{
    /**
     * Devuelve el listado completo de productos actuales en el servidor.
     */
    public function getProducts(): JsonResponse
    {
        $products = Product::orderBy('id')->get();
        return response()->json([
            'success' => true,
            'products' => $products,
            'server_time' => now()->toIso8601String(),
        ]);
    }

    /**
     * Recibe una o varias operaciones pendientes desde los clientes (Dispositivos).
     * Ejecuta validaciones de idempotencia, concurrencia/versión y aplica cambios.
     */
    public function push(Request $request): JsonResponse
    {
        $operations = $request->input('operations');

        // Soporte si se envía una única operación directamente
        if (!$operations && $request->has('operation_id')) {
            $operations = [$request->all()];
        }

        if (!is_array($operations)) {
            return response()->json([
                'success' => false,
                'message' => 'Formato inválido. Se esperaba una lista de operaciones.',
                'results' => [],
            ], 422);
        }

        $results = [];

        foreach ($operations as $op) {
            $operationId = $op['operation_id'] ?? null;
            $clientId = $op['client_id'] ?? 'unknown';
            $recordId = $op['record_id'] ?? null;
            $payload = $op['payload'] ?? [];
            $baseVersion = isset($op['base_version']) ? (int)$op['base_version'] : 1;
            $force = isset($op['force']) ? (bool)$op['force'] : false;

            if (!$operationId || !$recordId) {
                $results[] = [
                    'operation_id' => $operationId,
                    'client_id' => $clientId,
                    'status' => 'ERROR',
                    'message' => 'Faltan parámetros obligatorios (operation_id o record_id).',
                ];
                continue;
            }

            // 1. REGLA DE IDEMPOTENCIA:
            // Comprobamos si esta operación ya fue procesada antes
            $alreadyProcessed = ProcessedOperation::where('operation_id', $operationId)->first();
            if ($alreadyProcessed) {
                $currentProduct = Product::find($recordId);
                $results[] = [
                    'operation_id' => $operationId,
                    'client_id' => $clientId,
                    'status' => 'ALREADY_PROCESSED',
                    'message' => 'Idempotencia: La operación ya fue procesada anteriormente el ' . $alreadyProcessed->processed_at->format('Y-m-d H:i:s') . '. No se vuelve a aplicar.',
                    'product' => $currentProduct,
                ];
                continue;
            }

            // 2. BUSCAR EL REGISTRO
            $product = Product::find($recordId);
            if (!$product) {
                $results[] = [
                    'operation_id' => $operationId,
                    'client_id' => $clientId,
                    'status' => 'ERROR',
                    'message' => "El producto con ID {$recordId} no existe en el servidor.",
                ];
                continue;
            }

            // 3. REGLA DE VERSIONADO Y DETECCIÓN DE CONFLICTOS:
            // Si la versión del servidor difiere de la base_version enviada por el cliente
            // y no se ha forzado la resolución, se genera un CONFLICTO.
            if ($product->version !== $baseVersion && !$force) {
                $results[] = [
                    'operation_id' => $operationId,
                    'client_id' => $clientId,
                    'status' => 'CONFLICT',
                    'message' => "Conflicto detectado: El servidor tiene versión {$product->version}, pero el dispositivo envió base_version {$baseVersion}.",
                    'server_version' => $product->version,
                    'server_data' => [
                        'id' => $product->id,
                        'name' => $product->name,
                        'price' => (float)$product->price,
                        'version' => (int)$product->version,
                        'updated_at' => $product->updated_at ? $product->updated_at->toIso8601String() : null,
                    ],
                    'device_payload' => $payload,
                    'base_version' => $baseVersion,
                ];
                continue;
            }

            // 4. APLICAR CAMBIOS
            if (isset($payload['name'])) {
                $product->name = $payload['name'];
            }
            if (isset($payload['price'])) {
                $product->price = (float)$payload['price'];
            }

            // Incrementamos la versión atómicamente
            $product->version += 1;
            $product->save();

            // 5. REGISTRAR OPERACIÓN PROCESADA (Idempotencia)
            ProcessedOperation::create([
                'operation_id' => $operationId,
                'client_id' => $clientId,
                'processed_at' => now(),
            ]);

            $results[] = [
                'operation_id' => $operationId,
                'client_id' => $clientId,
                'status' => 'SUCCESS',
                'message' => "Operación aplicada con éxito. Nueva versión: {$product->version}.",
                'product' => [
                    'id' => $product->id,
                    'name' => $product->name,
                    'price' => (float)$product->price,
                    'version' => (int)$product->version,
                    'updated_at' => $product->updated_at ? $product->updated_at->toIso8601String() : null,
                ],
            ];
        }

        return response()->json([
            'success' => true,
            'results' => $results,
            'server_time' => now()->toIso8601String(),
        ]);
    }

    /**
     * Endpoint PULL: Devuelve el estado actual de los productos para sincronización entrante.
     */
    public function pull(): JsonResponse
    {
        $products = Product::orderBy('id')->get();
        return response()->json([
            'success' => true,
            'products' => $products,
            'server_time' => now()->toIso8601String(),
        ]);
    }

    /**
     * Endpoint para reiniciar la demo a su estado inicial.
     */
    public function resetDemo(): JsonResponse
    {
        ProcessedOperation::truncate();
        Product::truncate();

        Product::create(['id' => 1, 'name' => 'Producto A', 'price' => 100.00, 'version' => 1]);
        Product::create(['id' => 2, 'name' => 'Producto B', 'price' => 200.00, 'version' => 1]);
        Product::create(['id' => 3, 'name' => 'Producto C', 'price' => 300.00, 'version' => 1]);

        return response()->json([
            'success' => true,
            'message' => 'Base de datos reiniciada a valores de prueba iniciales.',
            'products' => Product::orderBy('id')->get(),
        ]);
    }
}
