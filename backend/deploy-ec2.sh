#!/bin/bash

# GradTrack Backend EC2 Deployment Script
# Run this on your EC2 instance after initial setup

echo "🚀 Starting GradTrack Backend Deployment..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run with sudo"
    exit 1
fi

# Navigate to project directory
cd /var/www/html/gradtrack || exit 1

echo "📥 Pulling latest changes..."
git pull origin main

echo "📦 Installing dependencies..."
cd backend
composer install --no-dev --optimize-autoloader

echo "🔐 Setting permissions..."
chown -R www-data:www-data /var/www/html/gradtrack
chmod -R 755 /var/www/html/gradtrack
chmod 600 /var/www/html/gradtrack/backend/.env

echo "🔄 Restarting Apache..."
systemctl restart apache2

echo "✅ Deployment complete!"
echo ""
echo "Test your API:"
echo "curl http://localhost/api/auth/check.php"
