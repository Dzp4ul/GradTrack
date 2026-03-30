# 🚀 GradTrack Quick Reference Card

## 📋 Common Commands

### Initial Setup
```bash
# Windows
setup.bat

# Mac/Linux
chmod +x setup.sh && ./setup.sh
```

### Quick Start (Windows)
```bash
# Start everything at once
start-gradtrack.bat

# Or start separately:
start-backend.bat    # Backend only
start-frontend.bat   # Frontend only
```

### Local Development

#### Start Backend
```bash
# Option 1: XAMPP
# Just start XAMPP Apache

# Option 2: PHP Built-in Server
cd backend
php -S localhost:8000

# Option 3: Docker
docker-compose up
```

#### Start Frontend
```bash
cd frontend
npm run dev
# Open http://localhost:5173
```

### Build & Deploy

#### Frontend
```bash
cd frontend

# Install dependencies
npm install

# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type check
npm run typecheck

# Lint
npm run lint

# Deploy to Amplify
amplify publish

# Deploy to Vercel
vercel --prod

# Deploy to Netlify
netlify deploy --prod
```

#### Backend
```bash
cd backend

# Install dependencies
composer install

# Production dependencies only
composer install --no-dev --optimize-autoloader

# Deploy to Elastic Beanstalk
eb init
eb create
eb deploy

# Check status
eb status

# View logs
eb logs

# Set environment variable
eb setenv KEY=value

# Open in browser
eb open
```

### Docker Commands
```bash
# Start all services
docker-compose up

# Start in background
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f

# Rebuild
docker-compose up --build
```

### Root Helper Scripts
```bash
# Install all dependencies
npm run install:all

# Install frontend only
npm run install:frontend

# Install backend only
npm run install:backend

# Start frontend dev server
npm run dev:frontend

# Start backend dev server
npm run dev:backend

# Build frontend
npm run build:frontend

# Deploy backend
npm run deploy:backend

# Deploy frontend
npm run deploy:frontend

# Docker up
npm run docker:up

# Docker down
npm run docker:down

# Docker logs
npm run docker:logs
```

## 📁 Important Files

### Configuration
```
backend/.env                    # Database credentials
backend/.env.example            # Template

frontend/.env.development       # Local API URL
frontend/.env.production        # Production API URL
frontend/.env.example           # Template

frontend/src/config/api.ts      # API endpoints
```

### Documentation
```
QUICK_START.md                  # ⭐ Start here
DEPLOYMENT_CHECKLIST.md         # Detailed deployment
ARCHITECTURE.md                 # System architecture
MIGRATION_GUIDE.md              # Migration guide
VERIFICATION.md                 # Testing checklist
DOCS_INDEX.md                   # Documentation index
FINAL_SUMMARY.md                # Complete summary

frontend/README.md              # Frontend guide
backend/README.md               # Backend guide
```

### Deployment
```
backend/.ebextensions/          # AWS EB config
frontend/amplify.yml            # AWS Amplify config
docker-compose.yml              # Docker config
.github/workflows/deploy.yml    # CI/CD pipeline
```

## 🔧 Environment Variables

### Backend (.env)
```env
DB_HOST=your-rds-endpoint.rds.amazonaws.com
DB_NAME=gradtrackdb
DB_USER=admin
DB_PASSWORD=your_password
DB_PORT=3306
APP_ENV=production
CORS_ALLOWED_ORIGINS=https://your-frontend.com
```

### Frontend (.env.development)
```env
VITE_API_BASE_URL=http://localhost/GradTrack/backend
# or
VITE_API_BASE_URL=http://localhost:8000
```

### Frontend (.env.production)
```env
VITE_API_BASE_URL=https://your-backend-url.elasticbeanstalk.com
```

## 🚀 3-Step Deployment

### Step 1: Deploy Backend (5 min)
```bash
cd backend
eb init -p php-8.1 gradtrack-backend --region ap-southeast-2
eb create gradtrack-backend-prod
eb setenv DB_PASSWORD=your_password
eb deploy
eb status  # Copy the URL
```

### Step 2: Deploy Frontend (3 min)
1. Go to AWS Amplify Console
2. Connect GitHub repository
3. Set root directory: `frontend`
4. Add env var: `VITE_API_BASE_URL` = backend URL
5. Deploy

### Step 3: Configure CORS (2 min)
```bash
cd backend
eb setenv CORS_ALLOWED_ORIGINS=https://your-app.amplifyapp.com
```

## 🆘 Troubleshooting

### "Cannot find module"
```bash
cd frontend && npm install
cd backend && composer install
```

### "Database connection failed"
```bash
# Check backend/.env exists
# Verify credentials
# Test RDS connection
```

### "CORS error"
```bash
# Update backend/.env
CORS_ALLOWED_ORIGINS=http://localhost:5173

# Or for production
eb setenv CORS_ALLOWED_ORIGINS=https://your-frontend.com
```

### "API not found"
```bash
# Check frontend/.env.development
VITE_API_BASE_URL=http://localhost:8000

# Verify backend is running
curl http://localhost:8000/api/auth/check.php
```

### Check Logs
```bash
# Backend (Elastic Beanstalk)
eb logs

# Frontend (Amplify)
# Check Amplify Console

# Docker
docker-compose logs -f
```

## 📊 Project Structure
```
GradTrack/
├── frontend/          # React app
├── backend/           # PHP API
├── database/          # SQL files
├── .github/           # CI/CD
├── setup.sh           # Unix setup
├── setup.bat          # Windows setup
└── docker-compose.yml # Docker
```

## 🔗 Quick Links

- **AWS Amplify Console**: https://console.aws.amazon.com/amplify/
- **AWS EB Console**: https://console.aws.amazon.com/elasticbeanstalk/
- **AWS RDS Console**: https://console.aws.amazon.com/rds/
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Netlify Dashboard**: https://app.netlify.com/

## 📞 Documentation

| Need | Read |
|------|------|
| Quick deployment | QUICK_START.md |
| Detailed steps | DEPLOYMENT_CHECKLIST.md |
| System design | ARCHITECTURE.md |
| Migration help | MIGRATION_GUIDE.md |
| Testing | VERIFICATION.md |
| All docs | DOCS_INDEX.md |

## ✅ Pre-Deployment Checklist

- [ ] Tested locally
- [ ] Updated environment variables
- [ ] Backed up database
- [ ] Read QUICK_START.md
- [ ] Ready to deploy!

## 🎯 Deployment Difficulty: 10/10 ⭐

**Total Time**: 10 minutes
**Cost**: $20-45/month
**Status**: Production Ready ✅

---

**Keep this file handy for quick reference!**
