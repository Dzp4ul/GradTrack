# 🚀 How to Run GradTrack Locally

## ⚡ EASIEST WAY (Recommended)

### Just Double-Click This File:
```
start-gradtrack.bat
```

This will automatically:
- ✅ Start the backend server (PHP)
- ✅ Start the frontend server (React)
- ✅ Open 2 terminal windows

Then open your browser to: **http://localhost:5173**

---

## 📋 Alternative Methods

### Method 1: Start Both Separately

#### Start Backend:
Double-click: `start-backend.bat`

Or manually:
```bash
cd C:\xampp\htdocs\GradTrack\backend
npm run dev
# or
php -S localhost:8000
```

#### Start Frontend:
Double-click: `start-frontend.bat`

Or manually:
```bash
cd C:\xampp\htdocs\GradTrack\frontend
npm run dev
```

---

### Method 2: Using XAMPP (Alternative)

1. **Start XAMPP Apache**
2. **Start Frontend**:
   ```bash
   cd C:\xampp\htdocs\GradTrack\frontend
   npm run dev
   ```
3. **Update frontend/.env.development**:
   ```
   VITE_API_BASE_URL=http://localhost/GradTrack/backend
   ```

---

## ✅ What You Should See

### Backend Running:
```
PHP 8.x Development Server (http://localhost:8000) started
```

### Frontend Running:
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

---

## 🌐 Access Your Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000/api/auth/check.php

---

## 🛑 How to Stop

Press `Ctrl + C` in each terminal window, or just close the windows.

---

## ❌ Troubleshooting

### "php is not recognized"
**Solution**: Install PHP or use XAMPP
```bash
# Check if PHP is installed
php -v
```

### "Port 8000 already in use"
**Solution**: Change the port
```bash
cd backend
php -S localhost:8001
```
Then update `frontend/.env.development`:
```
VITE_API_BASE_URL=http://localhost:8001
```

### "npm is not recognized"
**Solution**: Install Node.js from https://nodejs.org

### Frontend can't connect to backend
**Solution**: Make sure backend is running first
```bash
# Test backend
curl http://localhost:8000/api/auth/check.php
```

---

## 📝 Quick Commands Reference

| Task | Command |
|------|---------|
| **Start Everything** | Double-click `start-gradtrack.bat` |
| **Start Backend Only** | Double-click `start-backend.bat` |
| **Start Frontend Only** | Double-click `start-frontend.bat` |
| **Stop Servers** | Press `Ctrl + C` or close windows |

---

## 🎯 First Time Setup

If this is your first time running:

1. **Run setup script**:
   ```bash
   setup.bat
   ```

2. **Update environment variables**:
   - Edit `backend/.env` with your database credentials
   - Edit `frontend/.env.development` with backend URL

3. **Start the system**:
   ```bash
   start-gradtrack.bat
   ```

---

## ✅ You're Ready!

Just double-click **`start-gradtrack.bat`** and you're good to go! 🚀
