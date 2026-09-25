FROM php:8.3-apache

# Set working directory
WORKDIR /var/www/html

# Install system dependencies and required PHP extension libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    zip \
    unzip \
    libzip-dev \
    libpq-dev \
    sqlite3 \
    libsqlite3-dev \
    && docker-php-ext-install pdo pdo_pgsql pdo_mysql pdo_sqlite bcmath zip opcache pcntl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Use the default production configuration for PHP
RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    && echo "memory_limit=256M" >> "$PHP_INI_DIR/conf.d/laravel.ini" \
    && echo "upload_max_filesize=64M" >> "$PHP_INI_DIR/conf.d/laravel.ini" \
    && echo "post_max_size=64M" >> "$PHP_INI_DIR/conf.d/laravel.ini"

# Install Composer from official image
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Configure Apache virtual host for Laravel public directory
RUN echo '<VirtualHost *:80>\n\
    DocumentRoot /var/www/html/public\n\
    <Directory /var/www/html/public>\n\
        Options -Indexes +FollowSymLinks\n\
        AllowOverride All\n\
        Require all granted\n\
    </Directory>\n\
    ErrorLog ${APACHE_LOG_DIR}/error.log\n\
    CustomLog ${APACHE_LOG_DIR}/access.log combined\n\
</VirtualHost>' > /etc/apache2/sites-available/000-default.conf \
    && echo "ServerName localhost" >> /etc/apache2/apache2.conf \
    && sed -i 's|Alias /icons/|# Alias /icons/|g' /etc/apache2/mods-available/alias.conf /etc/apache2/mods-enabled/alias.conf 2>/dev/null || true \
    && a2enmod rewrite headers

# Copy application files (excluding those in .dockerignore)
COPY . /var/www/html

# Install production dependencies via Composer
RUN composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist

# Copy entrypoint script, normalize CRLF to LF, and set execution permissions
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh

# Set directory permissions for Laravel storage and cache
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache \
    && chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

# Default port (will be dynamically adjusted by entrypoint.sh via Render's $PORT)
EXPOSE 80

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
