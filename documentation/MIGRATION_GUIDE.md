# Migration Guide: Old Structure → New Structure

## What Changed?

Your GradTrack system has been restructured for production deployment. Here's what happened:

## File Movements

### Frontend Files (Moved to `frontend/`)
- ✅ `src/` → `frontend/src/`
- ✅ `public/` → `frontend/public/`
- ✅ `index.html` → `frontend/index.html`
- ✅ `package.json` → `frontend/package.json`
- ✅ `vite.config.ts` → `frontend/vite.config.ts`
- ✅ `tailwind.config.js` → `frontend/tailwind.config.js`
- ✅ `tsconfig.*.json` → `frontend/tsconfig.*.json`
- ✅ All other frontend configs → `frontend/`

### Backend Files (Moved to `backend/`)
- ✅ `api/` → `backend/api/`
- ✅ `vendor/` → `backend/vendor/`
- ✅ `composer.json` → `backend/composer.json`

### Unchanged
- ✅ `database/` - Stays in root
- ✅ Documentation files - Stays in root

## Code Changes

### 1. Frontend: AuthContext.tsx
**Changed**: Removed hardcoded admin credentials
```typescript
// ❌ REMOVED (Security Risk)
const hardcodedEmail = "admin@norzagaray.edu.ph";
const hardcodedPassword = "admin123";

// ✅ NOW: All authentication goes through database
```

**Changed**: Now uses API config
```typescript
// ❌ OLD
fetch('/api/auth/login.php', ...)

// ✅ NEW
import { API_ENDPOINTS } from '../config/api';
fetch(API_ENDPOINTS.AUTH.LOGIN, ...)
```

### 2. Frontend: New API Config
**Added**: `frontend/src/config/api.ts`
```typescript
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: `${API_BASE_URL}/api/auth/login.php`,
    // ... all endpoints
  }
};
```

### 3. Frontend: Vite Config
**Removed**: Proxy configuration (not needed in production)
```typescript
// ❌ REMOVED
server: {
  proxy: {
    '/api': { target: 'http://localhost', ... }
  }
}
```

### 4. Backend: Database.php
**Changed**: Now reads from environment variables
```php
// ❌ OLD (Hardcoded)
private $host = "gradtrackdb.cry06m2ok5u8...";
private $password = "Gradtrack301";

// ✅ NEW (Environment Variables)
public function __construct() {
    $this->loadEnv();
    $this->host = getenv('DB_HOST');
    $this->password = getenv('DB_PASSWORD');
}
```

## New Files Added

### Configuration Files
- ✅ `backend/.env` - Database credentials
- ✅ `backend/.env.example` - Template for .env
- ✅ `frontend/.env.development` - Local API URL
- ✅ `frontend/.env.production` - Production API URL
- ✅ `frontend/.env.example` - Template

### Deployment Files
- ✅ `backend/.ebextensions/01_environment.config` - AWS EB config
- ✅ `backend/.htaccess` - Apache config with CORS
- ✅ `backend/Dockerfile` - Docker support
- ✅ `frontend/amplify.yml` - AWS Amplify config
- ✅ `.github/workflows/deploy.yml` - CI/CD pipeline
- ✅ `docker-compose.yml` - Local Docker development

### Scripts
- ✅ `setup.sh` - Unix setup script
- ✅ `setup.bat` - Windows setup script
- ✅ `backend/deploy.sh` - Backend deployment
- ✅ `frontend/deploy.sh` - Frontend deployment
- ✅ `package.json` - Root package with helper scripts

### Documentation
- ✅ `README.md` - Updated main documentation
- ✅ `QUICK_START.md` - Quick deployment guide
- ✅ `DEPLOYMENT_CHECKLIST.md` - Detailed deployment steps
- ✅ `ARCHITECTURE.md` - System architecture
- ✅ `frontend/README.md` - Frontend-specific docs
- ✅ `backend/README.md` - Backend-specific docs

### Git Files
- ✅ `.gitignore` - Root gitignore
- ✅ `frontend/.gitignore` - Frontend gitignore
- ✅ `backend/.gitignore` - Backend gitignore

## How to Update Your Workflow

### Old Workflow (XAMPP)
```bash
# Start XAMPP
# Open http://localhost/GradTrack
```

### New Workflow (Development)

**Option 1: Using XAMPP**
```bash
# Terminal 1: Start XAMPP Apache
# Terminal 2:
cd frontend
npm run dev
# Open http://localhost:5173
```

**Option 2: Without XAMPP**
```bash
# Terminal 1: Backend
cd backend
php -S localhost:8000

# Terminal 2: Frontend
cd frontend
npm run dev
# Open http://localhost:5173
```

**Option 3: Docker**
```bash
docker-compose up
# Open http://localhost:5173
```

## Environment Variables Setup

### Backend (.env)
Create `backend/.env`:
```env
DB_HOST=gradtrackdb.cry06m2ok5u8.ap-southeast-2.rds.amazonaws.com
DB_NAME=gradtrackdb
DB_USER=admin
DB_PASSWORD=Gradtrack301
DB_PORT=3306
APP_ENV=development
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

### Frontend (.env.development)
Create `frontend/.env.development`:
```env
VITE_API_BASE_URL=http://localhost/GradTrack/backend
```

Or if using PHP built-in server:
```env
VITE_API_BASE_URL=http://localhost:8000
```

## Testing the Migration

### 1. Test Backend
```bash
cd backend
php -S localhost:8000

# In another terminal, test API:
curl http://localhost:8000/api/auth/check.php
```

### 2. Test Frontend
```bash
cd frontend
npm install
npm run dev
```

### 3. Test Integration
1. Open `http://localhost:5173`
2. Try to login
3. Check browser console for errors
4. Verify API calls are working

## Troubleshooting

### "Cannot find module" errors
```bash
cd frontend
npm install
```

### "Database connection failed"
- Check `backend/.env` exists
- Verify database credentials
- Test RDS connection

### "CORS error" in browser
- Update `backend/.env`:
  ```env
  CORS_ALLOWED_ORIGINS=http://localhost:5173
  ```

### Frontend can't reach backend
- Check `frontend/.env.development`
- Verify backend is running
- Check browser console for exact error

### "Class 'Database' not found"
```bash
cd backend
composer install
```

## Rollback (If Needed)

If you need to go back to the old structure:

1. **Backup current state**:
   ```bash
   cd ..
   cp -r GradTrack GradTrack-new-backup
   ```

2. **Restore from Git** (if you have old version):
   ```bash
   git checkout <old-commit-hash>
   ```

3. **Manual rollback**:
   - Move `frontend/src` back to `src/`
   - Move `backend/api` back to `api/`
   - Restore old `database.php` with hardcoded credentials

## Next Steps

1. ✅ Test locally with new structure
2. ✅ Update your development workflow
3. ✅ Commit changes to Git
4. ✅ Follow `QUICK_START.md` to deploy
5. ✅ Update team documentation

## Benefits of New Structure

- ✅ **Security**: No hardcoded credentials
- ✅ **Scalability**: Cloud-ready architecture
- ✅ **Maintainability**: Clear separation of concerns
- ✅ **Deployment**: Multiple deployment options
- ✅ **Development**: Better local development experience
- ✅ **Documentation**: Comprehensive guides

## Questions?

- Check `README.md` for overview
- Check `QUICK_START.md` for deployment
- Check `ARCHITECTURE.md` for technical details
- Check specific README files in `frontend/` and `backend/`

Your system is now production-ready! 🚀
