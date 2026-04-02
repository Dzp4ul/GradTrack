# GradTrack System

Graduate tracking and survey management system with AI-powered analytics.

## ✨ New Feature: AI-Powered Analytics

The Reports & Analytics section now includes AI-generated descriptive insights powered by Groq's LLaMA model. Get comprehensive narrative analysis of graduate employment data automatically.

**Setup:** See `backend/AI_ANALYTICS_SETUP.md` for configuration instructions.

## Features

- 📊 Graduate tracking and management
- 📝 Dynamic survey creation and distribution
- 📈 Comprehensive analytics and reporting
- 🤖 **AI-powered descriptive analytics** (NEW)
- 👥 Multi-role access control (Admin, Registrar, Dean)
- 📧 Email notifications
- 📱 Responsive design
- 🔒 Secure authentication

## Project Structure

```
GradTrack/
├── frontend/          # React + TypeScript + Vite
│   ├── src/
│   ├── public/
│   ├── .env.development
│   ├── .env.production
│   └── README.md
├── backend/           # PHP API
│   ├── api/
│   ├── .env
│   ├── EC2_DEPLOYMENT.md
│   └── README.md
└── database/          # SQL files
```

## Default Accounts

- Super Admin: `admin@norzagaray.edu.ph` / `admin123`
- Super Admin: `superadmin@gradtrack.com` / `Superadin2026`
- Registrar: `registrar@norzagaray.edu.ph` / `Registrar2026`
- Dean (CS - BSCS/ACT): `deancs@gradtrack.com` / `COMSCIE2026`
- Dean (COED - BSED/BEED): `deancoed@gradtrack.com` / `COED2026`
- Dean (HM - BSHM): `deanhm@gradtrack.com` / `HostManagement2026`

## Quick Start (Local Development)

### Backend Setup

1. Navigate to backend:
```bash
cd backend
```

2. Install dependencies:
```bash
composer install
```

3. Copy and configure environment:
```bash
cp .env.example .env
# Edit .env with your database credentials
# Add GROQ_API_KEY for AI analytics (optional)
```

**Optional: Setup AI Analytics**
```bash
# Windows
setup-ai.bat

# Linux/Mac
chmod +x setup-ai.sh
./setup-ai.sh
```

4. Start XAMPP or PHP server:
```bash
# Using XAMPP: Start Apache
# OR using PHP built-in server:
php -S localhost:8000
```

### Frontend Setup

1. Navigate to frontend:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env.development
# Edit .env.development with backend URL
```

4. Start development server:
```bash
npm run dev
```

## Production Deployment

### Architecture
- **Frontend**: AWS Amplify (or Vercel/Netlify)
- **Backend**: AWS EC2
- **Database**: AWS RDS (already configured)

### Step 1: Deploy Backend to AWS EC2

```bash
# 1. Launch EC2 instance (Ubuntu 22.04 LTS)
# 2. Connect via SSH
ssh -i your-key.pem ubuntu@your-ec2-ip

# 3. Install dependencies
sudo apt update
sudo apt install -y apache2 php8.1 php8.1-mysql php8.1-xml php8.1-mbstring composer git

# 4. Clone your repository
cd /var/www/html
sudo git clone your-repo-url gradtrack
cd gradtrack/backend

# 5. Install PHP dependencies
sudo composer install --no-dev --optimize-autoloader

# 6. Configure environment
sudo cp .env.example .env
sudo nano .env  # Update with your RDS credentials

# 7. Set permissions
sudo chown -R www-data:www-data /var/www/html/gradtrack
sudo chmod -R 755 /var/www/html/gradtrack

# 8. Configure Apache
sudo nano /etc/apache2/sites-available/gradtrack.conf
# (See backend/README.md for Apache config)

sudo a2ensite gradtrack
sudo a2enmod rewrite
sudo systemctl restart apache2
```

Copy the EC2 public IP or domain (e.g., `http://your-ec2-ip` or `http://api.yourdomain.com`)

### Step 2: Deploy Frontend to AWS Amplify

#### Option A: Amplify Console (Easiest)

1. Push code to GitHub
2. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
3. Click "New app" → "Host web app"
4. Connect your GitHub repository
5. Configure build settings:
   - **App root directory**: `frontend`
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
6. Add environment variable:
   - Key: `VITE_API_BASE_URL`
   - Value: `http://your-ec2-ip`
7. Click "Save and deploy"

#### Option B: Amplify CLI

```bash
cd frontend

# Install Amplify CLI
npm install -g @aws-amplify/cli

# Configure Amplify
amplify configure

# Initialize
amplify init

# Add hosting
amplify add hosting

# Set environment variable
# (Add VITE_API_BASE_URL in amplify console after publish)

# Publish
amplify publish
```

### Step 3: Update CORS

Update backend CORS to allow frontend domain:

```bash
# SSH into EC2
ssh -i your-key.pem ubuntu@your-ec2-ip

# Update .env file
cd /var/www/html/gradtrack/backend
sudo nano .env
# Update: CORS_ALLOWED_ORIGINS=https://your-amplify-domain.amplifyapp.com
```

## Alternative Deployment Options

### Frontend Alternatives

**Vercel** (Recommended for simplicity):
```bash
cd frontend
npm install -g vercel
vercel
# Set VITE_API_BASE_URL in Vercel dashboard
```

**Netlify**:
```bash
cd frontend
npm install -g netlify-cli
netlify deploy --prod
# Set VITE_API_BASE_URL in Netlify dashboard
```

### Backend Alternatives

**AWS EC2** (Current setup):
- Full control over server
- Cost-effective
- Easy to manage

**Traditional VPS** (DigitalOcean, Linode):
- Deploy to Ubuntu server with Apache/Nginx
- More control, requires server management

### Frontend (.env.production)
```
VITE_API_BASE_URL=https://your-backend-url.com
```

## Security Checklist

- [ ] Never commit `.env` files
- [ ] Use environment variables for all credentials
- [ ] Update CORS origins for production
- [ ] Enable HTTPS for both frontend and backend
- [ ] Set secure session cookies
- [ ] Keep dependencies updated
- [ ] Enable AWS WAF for DDoS protection
- [ ] Use AWS Secrets Manager for sensitive data

## Monitoring

- **Frontend**: AWS Amplify Console (built-in monitoring)
- **Backend**: EC2 CloudWatch (metrics, logs)
- **Database**: AWS RDS Console (performance insights)

## Cost Estimation

- **AWS Amplify**: ~$0.15/GB served + $0.01/build minute
- **EC2 t3.small**: ~$15-20/month
- **RDS**: Already running (current cost)
- **Total**: ~$20-35/month

## Support

For detailed deployment instructions:
- Frontend: See `frontend/README.md`
- Backend: See `backend/README.md` and `backend/EC2_DEPLOYMENT.md`

## License

Private - All rights reserved
