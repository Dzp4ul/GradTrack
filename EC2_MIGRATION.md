# ✅ Updated to AWS EC2 Deployment

## What Changed

Your GradTrack system has been updated to use **AWS EC2** instead of AWS Elastic Beanstalk for backend deployment.

---

## 📊 Comparison

| Aspect | Elastic Beanstalk | EC2 (Current) |
|--------|-------------------|---------------|
| **Control** | Managed service | Full control |
| **Cost** | $15-30/month | $15-20/month |
| **Setup Time** | 5 minutes | 15 minutes |
| **Flexibility** | Limited | High |
| **Maintenance** | Automatic | Manual |
| **Deployment** | `eb deploy` | SSH + Git pull |

---

## 🆕 New Files Created

1. **backend/EC2_DEPLOYMENT.md** - Complete EC2 deployment guide
2. **backend/deploy-ec2.sh** - Deployment script for EC2
3. **backend/apache-config.conf** - Apache virtual host template

---

## 🗑️ Files Removed

1. **backend/.ebextensions/** - Elastic Beanstalk configuration (no longer needed)
2. **backend/deploy.sh** - Renamed to deploy-ec2.sh

---

## 📝 Updated Documentation

### Files Updated:
1. ✅ **README.md** - Main deployment guide
2. ✅ **QUICK_START.md** - Quick deployment steps
3. ✅ **backend/README.md** - Backend deployment instructions

### Changes Made:
- Replaced all `eb` commands with EC2 SSH commands
- Updated deployment time (5 min → 15 min)
- Updated cost estimation ($20-45 → $20-35)
- Added Apache configuration steps
- Added EC2 security group configuration

---

## 🚀 New Deployment Process

### Quick Steps:

1. **Launch EC2 Instance** (Ubuntu 22.04)
2. **SSH into EC2**:
   ```bash
   ssh -i your-key.pem ubuntu@YOUR_EC2_IP
   ```

3. **Install Dependencies**:
   ```bash
   sudo apt update
   sudo apt install -y apache2 php8.1 php8.1-mysql php8.1-xml php8.1-mbstring composer git
   ```

4. **Deploy Application**:
   ```bash
   cd /var/www/html
   sudo git clone your-repo-url gradtrack
   cd gradtrack/backend
   sudo composer install --no-dev --optimize-autoloader
   ```

5. **Configure Environment**:
   ```bash
   sudo cp .env.example .env
   sudo nano .env  # Update with RDS credentials
   ```

6. **Set Permissions**:
   ```bash
   sudo chown -R www-data:www-data /var/www/html/gradtrack
   sudo chmod -R 755 /var/www/html/gradtrack
   ```

7. **Configure Apache**:
   ```bash
   sudo cp apache-config.conf /etc/apache2/sites-available/gradtrack.conf
   sudo nano /etc/apache2/sites-available/gradtrack.conf  # Update ServerName
   sudo a2ensite gradtrack
   sudo a2enmod rewrite headers
   sudo systemctl restart apache2
   ```

---

## 📖 Documentation Guide

### For Complete EC2 Deployment:
👉 Read: **backend/EC2_DEPLOYMENT.md**

This comprehensive guide includes:
- Step-by-step EC2 setup
- Apache configuration
- SSL certificate setup (Let's Encrypt)
- Security best practices
- Monitoring and logging
- Troubleshooting guide
- Deployment automation script

### For Quick Deployment:
👉 Read: **QUICK_START.md**

Updated with EC2 deployment steps (15 minutes total)

---

## 💰 Cost Comparison

### Elastic Beanstalk (Old):
- Service: $15-30/month
- Total: $20-45/month

### EC2 (New):
- t3.small instance: $15-20/month
- Elastic IP: Free (when attached)
- Total: $20-35/month

**Savings**: ~$5-10/month

---

## ✅ Benefits of EC2

1. **Full Control**: Complete access to server configuration
2. **Cost-Effective**: Slightly cheaper than Elastic Beanstalk
3. **Flexibility**: Install any software or configuration
4. **Learning**: Better understanding of server management
5. **Customization**: Full Apache/PHP configuration control

---

## ⚠️ Considerations

1. **Manual Updates**: Need to SSH and update manually
2. **Server Management**: Responsible for security patches
3. **Monitoring**: Need to set up CloudWatch manually
4. **Scaling**: Manual scaling (vs automatic with EB)

---

## 🛠️ Deployment Automation

Use the provided script for easy updates:

```bash
# On EC2, create deployment script
sudo nano /home/ubuntu/deploy.sh

# Copy content from backend/deploy-ec2.sh

# Make executable
chmod +x /home/ubuntu/deploy.sh

# Use it
./deploy.sh
```

---

## 🔐 Security Setup

### 1. Configure Security Group
- Port 22 (SSH): Your IP only
- Port 80 (HTTP): 0.0.0.0/0
- Port 443 (HTTPS): 0.0.0.0/0

### 2. Set Up Firewall
```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 3. Install SSL Certificate
```bash
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d your-domain.com
```

### 4. Set Up Fail2Ban
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
```

---

## 📊 Monitoring

### CloudWatch Metrics
- CPU Utilization
- Network In/Out
- Disk I/O
- Memory (requires CloudWatch agent)

### Application Logs
```bash
# Apache error log
sudo tail -f /var/log/apache2/gradtrack-error.log

# Apache access log
sudo tail -f /var/log/apache2/gradtrack-access.log

# PHP errors
sudo tail -f /var/log/apache2/error.log
```

---

## 🆘 Troubleshooting

### Common Issues

**Can't connect to EC2**:
- Check security group allows your IP on port 22
- Verify key pair permissions: `chmod 400 your-key.pem`

**Apache not starting**:
```bash
sudo systemctl status apache2
sudo apache2ctl configtest
```

**Database connection failed**:
```bash
# Test from EC2
mysql -h your-rds-endpoint -u admin -p
```

**CORS errors**:
```bash
# Update .env
sudo nano /var/www/html/gradtrack/backend/.env
# Set: CORS_ALLOWED_ORIGINS=https://your-frontend.com
sudo systemctl restart apache2
```

---

## 📚 Additional Resources

### Documentation:
- **EC2_DEPLOYMENT.md** - Complete deployment guide
- **QUICK_START.md** - Quick deployment (updated)
- **README.md** - Main documentation (updated)
- **backend/README.md** - Backend guide (updated)

### AWS Resources:
- EC2 Console: https://console.aws.amazon.com/ec2/
- RDS Console: https://console.aws.amazon.com/rds/
- CloudWatch: https://console.aws.amazon.com/cloudwatch/

---

## ✅ Migration Complete

Your system is now configured for AWS EC2 deployment:

- ✅ EC2 deployment guide created
- ✅ Apache configuration template added
- ✅ Deployment automation script created
- ✅ All documentation updated
- ✅ Elastic Beanstalk configs removed

**Deployment Difficulty**: Still 10/10 ⭐

**Total Deployment Time**: 15-20 minutes

---

## 🚀 Next Steps

1. **Read**: backend/EC2_DEPLOYMENT.md
2. **Launch**: EC2 instance (Ubuntu 22.04)
3. **Deploy**: Follow the guide
4. **Test**: Access your API
5. **Secure**: Set up SSL certificate

---

**Status**: ✅ READY FOR EC2 DEPLOYMENT
**Documentation**: Complete
**Scripts**: Ready
**Configuration**: Updated

Let's deploy to EC2! 🚀
