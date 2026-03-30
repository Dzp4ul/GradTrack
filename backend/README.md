# GradTrack Backend API

PHP backend API for GradTrack system.

## Requirements
- PHP 7.4+
- MySQL/MariaDB or AWS RDS
- Composer
- Apache or Nginx

## Local Development Setup

1. Install dependencies:
```bash
composer install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Update `.env` with your database credentials

4. Start local server (if not using XAMPP):
```bash
php -S localhost:8000
```

## AWS EC2 Deployment (Recommended)

For detailed EC2 deployment instructions, see [EC2_DEPLOYMENT.md](EC2_DEPLOYMENT.md)

### Quick EC2 Deployment

1. Launch Ubuntu 22.04 EC2 instance
2. SSH into instance:
```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_IP
```

3. Run deployment commands:
```bash
# Install dependencies
sudo apt update
sudo apt install -y apache2 php8.1 php8.1-mysql php8.1-xml php8.1-mbstring composer git

# Clone and setup
cd /var/www/html
sudo git clone your-repo-url gradtrack
cd gradtrack/backend
sudo composer install --no-dev --optimize-autoloader

# Configure
sudo cp .env.example .env
sudo nano .env  # Update credentials

# Set permissions
sudo chown -R www-data:www-data /var/www/html/gradtrack
sudo chmod -R 755 /var/www/html/gradtrack

# Configure Apache (see EC2_DEPLOYMENT.md)
# Enable site and restart
sudo a2ensite gradtrack
sudo a2enmod rewrite headers
sudo systemctl restart apache2
```

4. Access your API:
```
http://YOUR_EC2_IP/api/auth/check.php
```

## Environment Variables

Required variables (set in `.env` or EC2 environment):
- `DB_HOST` - Database host
- `DB_NAME` - Database name
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password (NEVER commit this)
- `DB_PORT` - Database port (default: 3306)
- `APP_ENV` - Application environment (development/production)
- `CORS_ALLOWED_ORIGINS` - Comma-separated allowed origins

## API Endpoints

- `POST /api/auth/login.php` - User login
- `POST /api/auth/logout.php` - User logout
- `GET /api/auth/check.php` - Check authentication
- `GET /api/graduates/index.php` - Get graduates
- `GET /api/surveys/index.php` - Get surveys
- `GET /api/dashboard/stats.php` - Get dashboard stats

## Security Notes

- Never commit `.env` file
- Always use environment variables for credentials
- Update CORS origins for production
- Keep PHP and dependencies updated
