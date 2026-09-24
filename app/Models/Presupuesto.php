<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Presupuesto extends Model
{
    use HasFactory;

    protected $table = 'presupuestos';

    protected $fillable = [
        'correlativo',
        'temp_correlativo',
        'client_id',
        'client_name',
        'subtotal',
        'tax',
        'total',
        'items',
        'version',
        'status',
    ];

    protected $casts = [
        'subtotal' => 'float',
        'tax' => 'float',
        'total' => 'float',
        'items' => 'array',
        'version' => 'integer',
    ];
}
