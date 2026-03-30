@echo off
echo ========================================
echo Starting GradTrack Backend Server
echo ========================================
echo.

cd backend

echo Backend server starting at http://localhost:8000
echo.
echo API endpoints will be available at:
echo - http://localhost:8000/api/auth/check.php
echo - http://localhost:8000/api/auth/login.php
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

php -S localhost:8000
