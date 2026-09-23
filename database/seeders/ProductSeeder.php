<?php

namespace Database\Seeders;

use App\Models\Product;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        Product::truncate();

        Product::create([
            'id' => 1,
            'name' => 'Producto A',
            'price' => 100.00,
            'version' => 1,
        ]);

        Product::create([
            'id' => 2,
            'name' => 'Producto B',
            'price' => 200.00,
            'version' => 1,
        ]);

        Product::create([
            'id' => 3,
            'name' => 'Producto C',
            'price' => 300.00,
            'version' => 1,
        ]);
    }
}
