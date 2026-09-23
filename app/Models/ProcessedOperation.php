<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProcessedOperation extends Model
{
    use HasFactory;

    protected $fillable = [
        'operation_id',
        'client_id',
        'processed_at',
    ];

    protected $casts = [
        'processed_at' => 'datetime',
    ];
}
