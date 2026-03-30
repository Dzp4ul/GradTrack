# AWS EC2 Deployment Guide for GradTrack Backend

## Prerequisites
- AWS Account
- EC2 Key Pair (.pem file)
- Domain name (optional, but recommended)

## Step 1: Launch EC2 Instance

### 1.1 Create EC2 Instance
1. Go to AWS EC2 Console
2. Click "Launch Instance"
3. Configure:
   - **Name**: gradtrack-backend
   - **AMI**: Ubuntu Server 22.04 LTS
   - **Instance Type**: t3.small (or t3.micro for testing)
   - **Key Pair**: Create or select existing
   - **Security Group**: Create new with these rules:
     - SSH (22) - Your IP
     - HTTP (80) - Anywhere (0.0.0.0/0)
     - HTTPS (443) - Anywhere (0.0.0.0/0)
4. Click "Launch Instance"

### 1.2 Allocate Elastic IP (Recommended)
1. Go to EC2 → Elastic IPs
2. Click "Allocate Elastic IP address"
3. Associate with your EC2 instance
4. Note the Elastic IP address

## Step 2: Connect to EC2

```bash
# Change key permissions
chmod 400 your-key.pem

# Connect via SSH
ssh -i your-key.pem ubuntu@YOUR_EC2_IP
```

## Step 3: Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Apache
sudo apt install -y apache2

# Install PHP 8.1 and extensions
sudo apt install -y php8.1 php8.1-cli php8.1-common php8.1-mysql \
  php8.1-xml php8.1-mbstring php8.1-curl php8.1-zip php8.1-gd

# Install Composer
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer

# Install Git
sudo apt install -y git

# Verify installations
php -v
composer -V
apache2 -v
```

## Step 4: Deploy Application

### 4.1 Clone Repository

```bash
# Navigate to web root
cd /var/www/html

# Remove default index
sudo rm -f index.html

# Clone your repository
sudo git clone https://github.com/your-username/GradTrack.git gradtrack

# Navigate to backend
cd gradtrack/backend
```

### 4.2 Install PHP Dependencies

```bash
sudo composer install --no-dev --optimize-autoloader
```

### 4.3 Configure Environment

```bash
# Copy environment file
sudo cp .env.example .env

# Edit environment file
sudo nano .env
```

Update with your values:
```env
DB_HOST=gradtrackdb.cry06m2ok5u8.ap-southeast-2.rds.amazonaws.com
DB_NAME=gradtrackdb
DB_USER=admin
DB_PASSWORD=Gradtrack301
DB_PORT=3306
APP_ENV=production
APP_DEBUG=false
CORS_ALLOWED_ORIGINS=https://your-frontend-domain.com
```

Save and exit (Ctrl+X, Y, Enter)

### 4.4 Set Permissions

```bash
# Set ownership to Apache user
sudo chown -R www-data:www-data /var/www/html/gradtrack

# Set proper permissions
sudo chmod -R 755 /var/www/html/gradtrack

# Make .env readable only by owner
sudo chmod 600 /var/www/html/gradtrack/backend/.env
```

## Step 5: Configure Apache

### 5.1 Create Virtual Host

```bash
sudo nano /etc/apache2/sites-available/gradtrack.conf
```

Add this configuration:
```apache
<VirtualHost *:80>
    ServerName your-domain.com
    ServerAlias www.your-domain.com
    
    DocumentRoot /var/www/html/gradtrack/backend
    
    <Directory /var/www/html/gradtrack/backend>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    
    # Enable CORS
    Header always set Access-Control-Allow-Origin "*"
    Header always set Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    Header always set Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With"
    Header always set Access-Control-Allow-Credentials "true"
    
    # Security headers
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-XSS-Protection "1; mode=block"
    
    ErrorLog ${APACHE_LOG_DIR}/gradtrack-error.log
    CustomLog ${APACHE_LOG_DIR}/gradtrack-access.log combined
</VirtualHost>
```

Save and exit.

### 5.2 Enable Site and Modules

```bash
# Enable the site
sudo a2ensite gradtrack.conf

# Enable required modules
sudo a2enmod rewrite
sudo a2enmod headers

# Disable default site
sudo a2dissite 000-default.conf

# Test configuration
sudo apache2ctl configtest

# Restart Apache
sudo systemctl restart apache2
```

## Step 6: Configure Security Group

Ensure your EC2 Security Group allows:
- **Port 22** (SSH) - Your IP only
- **Port 80** (HTTP) - 0.0.0.0/0
- **Port 443** (HTTPS) - 0.0.0.0/0

## Step 7: Test Deployment

```bash
# Test from EC2
curl http://localhost/api/auth/check.php

# Test from your computer
curl http://YOUR_EC2_IP/api/auth/check.php
```

You should see a JSON response.

## Step 8: Set Up SSL (Recommended)

### 8.1 Install Certbot

```bash
sudo apt install -y certbot python3-certbot-apache
```

### 8.2 Obtain SSL Certificate

```bash
# Make sure your domain points to your EC2 IP first
sudo certbot --apache -d your-domain.com -d www.your-domain.com
```

Follow the prompts. Certbot will automatically configure HTTPS.

### 8.3 Test Auto-Renewal

```bash
sudo certbot renew --dry-run
```

## Step 9: Update Frontend Configuration

Update your frontend `.env.production`:
```env
VITE_API_BASE_URL=https://your-domain.com
# or
VITE_API_BASE_URL=http://YOUR_EC2_IP
```

## Deployment Script

Create a deployment script for easy updates:

```bash
sudo nano /home/ubuntu/deploy.sh
```

Add:
```bash
#!/bin/bash

echo "🚀 Deploying GradTrack Backend..."

cd /var/www/html/gradtrack

# Pull latest changes
sudo git pull origin main

# Install dependencies
cd backend
sudo composer install --no-dev --optimize-autoloader

# Set permissions
sudo chown -R www-data:www-data /var/www/html/gradtrack
sudo chmod -R 755 /var/www/html/gradtrack
sudo chmod 600 /var/www/html/gradtrack/backend/.env

# Restart Apache
sudo systemctl restart apache2

echo "✅ Deployment complete!"
```

Make executable:
```bash
chmod +x /home/ubuntu/deploy.sh
```

Use it:
```bash
./deploy.sh
```

## Monitoring and Maintenance

### Check Apache Status
```bash
sudo systemctl status apache2
```

### View Logs
```bash
# Error logs
sudo tail -f /var/log/apache2/gradtrack-error.log

# Access logs
sudo tail -f /var/log/apache2/gradtrack-access.log

# PHP errors
sudo tail -f /var/log/apache2/error.log
```

### Restart Services
```bash
sudo systemctl restart apache2
```

### Update Application
```bash
cd /var/www/html/gradtrack
sudo git pull
cd backend
sudo composer install --no-dev --optimize-autoloader
sudo systemctl restart apache2
```

## Troubleshooting

### Issue: 403 Forbidden
```bash
# Check permissions
ls -la /var/www/html/gradtrack/backend

# Fix permissions
sudo chown -R www-data:www-data /var/www/html/gradtrack
sudo chmod -R 755 /var/www/html/gradtrack
```

### Issue: Database Connection Failed
```bash
# Check .env file
sudo cat /var/www/html/gradtrack/backend/.env

# Test RDS connection from EC2
mysql -h gradtrackdb.cry06m2ok5u8.ap-southeast-2.rds.amazonaws.com -u admin -p
```

### Issue: CORS Errors
```bash
# Update .env
sudo nano /var/www/html/gradtrack/backend/.env
# Set: CORS_ALLOWED_ORIGINS=https://your-frontend-domain.com

# Restart Apache
sudo systemctl restart apache2
```

### Issue: PHP Errors Not Showing
```bash
# Check PHP error log
sudo tail -f /var/log/apache2/error.log
```

## Security Best Practices

1. **Keep System Updated**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Configure Firewall**
   ```bash
   sudo ufw allow 22
   sudo ufw allow 80
   sudo ufw allow 443
   sudo ufw enable
   ```

3. **Disable Root Login**
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Set: PermitRootLogin no
   sudo systemctl restart sshd
   ```

4. **Set Up Fail2Ban**
   ```bash
   sudo apt install -y fail2ban
   sudo systemctl enable fail2ban
   sudo systemctl start fail2ban
   ```

5. **Regular Backups**
   - Backup `.env` file
   - Backup database (RDS snapshots)
   - Backup application code

## Cost Estimation

- **EC2 t3.small**: ~$15-20/month
- **Elastic IP**: Free (when attached)
- **Data Transfer**: ~$5-10/month
- **RDS**: Already running
- **Total**: ~$20-30/month

## Next Steps

1. ✅ Backend deployed on EC2
2. Deploy frontend to AWS Amplify
3. Update CORS settings
4. Set up SSL certificate
5. Configure monitoring
6. Set up automated backups

## Support

For issues:
- Check Apache logs: `sudo tail -f /var/log/apache2/gradtrack-error.log`
- Check PHP logs: `sudo tail -f /var/log/apache2/error.log`
- Test API: `curl http://localhost/api/auth/check.php`
