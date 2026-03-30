@echo off
echo ========================================
echo GradTrack Environment Setup
echo ========================================
echo.

echo [1/4] Setting up Backend...
cd backend
if not exist .env (
    echo Creating .env from .env.example...
    copy .env.example .env
    echo Please update backend\.env with your database credentials
) else (
    echo .env already exists
)

echo.
echo [2/4] Installing Backend Dependencies...
call composer install
if %errorlevel% neq 0 (
    echo Error: Composer install failed
    pause
    exit /b 1
)

cd ..

echo.
echo [3/4] Setting up Frontend...
cd frontend
if not exist .env.development (
    echo Creating .env.development from .env.example...
    copy .env.example .env.development
    echo Please update frontend\.env.development with your backend URL
) else (
    echo .env.development already exists
)

echo.
echo [4/4] Installing Frontend Dependencies...
call npm install
if %errorlevel% neq 0 (
    echo Error: npm install failed
    pause
    exit /b 1
)

cd ..

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Update backend\.env with your database credentials
echo 2. Update frontend\.env.development with your backend URL
echo 3. Start backend: cd backend ^&^& php -S localhost:8000
echo 4. Start frontend: cd frontend ^&^& npm run dev
echo.
echo For deployment instructions, see README.md
echo.
pause
