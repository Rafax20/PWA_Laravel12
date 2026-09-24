#!/bin/sh
set -e

# Dynamically set Apache port from Render $PORT (default 80 if not set)
PORT="${PORT:-80}"
echo "==> Configuring Apache to listen on port ${PORT}..."
sed -i "s/Listen [0-9]*/Listen ${PORT}/g" /etc/apache2/ports.conf
sed -i "s/<VirtualHost \*:[0-9]*>/<VirtualHost \*:${PORT}>/g" /etc/apache2/sites-available/000-default.conf

# Ensure required storage and cache directories exist and have proper permissions
echo "==> Setting directory permissions..."
mkdir -p /var/www/html/storage/framework/sessions \
         /var/www/html/storage/framework/views \
         /var/www/html/storage/framework/cache \
         /var/www/html/storage/logs \
         /var/www/html/bootstrap/cache

chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache
chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

# Handle SQLite fallback if DB_CONNECTION is sqlite and no DATABASE_URL is set
if [ "$DB_CONNECTION" = "sqlite" ] || ([ -z "$DB_CONNECTION" ] && [ -z "$DATABASE_URL" ] && [ -z "$DB_HOST" ]); then
    echo "==> Using SQLite database..."
    touch /var/www/html/database/database.sqlite
    chown -R www-data:www-data /var/www/html/database
fi

# Clear previous configuration and route caches so dynamic environment variables are loaded
echo "==> Clearing cached configurations..."
php artisan config:clear || true
php artisan route:clear || true
php artisan view:clear || true

# Execute database migrations
echo "==> Running database migrations..."
php artisan migrate --force || echo "⚠️ Warning: database migrations failed or database is not reachable. Application will continue starting."

# Seed initial products if table is empty or SEED_ON_DEPLOY is true
if [ "$SEED_ON_DEPLOY" = "true" ]; then
    echo "==> Force running ProductSeeder..."
    php artisan db:seed --class=ProductSeeder --force || true
else
    echo "==> Checking if initial seed is needed..."
    php artisan tinker --execute="if (\Illuminate\Support\Facades\Schema::hasTable('products') && \App\Models\Product::count() === 0) { (new \Database\Seeders\ProductSeeder())->run(); echo 'Seeded initial products.'; }" || true
fi

echo "==> PWA Laravel application ready. Starting Apache on 0.0.0.0:${PORT}..."
exec apache2-foreground
