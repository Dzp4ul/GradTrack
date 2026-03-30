@echo off
echo ========================================
echo Starting GradTrack System
echo ========================================
echo.
echo This will open 2 terminal windows:
echo 1. Backend Server (PHP)
echo 2. Frontend Server (React)
echo.
echo Press any key to continue...
pause > nul

echo.
echo Starting Backend Server...
start "GradTrack Backend" cmd /k "cd /d %~dp0 && start-backend.bat"

timeout /t 3 > nul

echo Starting Frontend Server...
start "GradTrack Frontend" cmd /k "cd /d %~dp0 && start-frontend.bat"

echo.
echo ========================================
echo Both servers are starting!
echo ========================================
echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Close this window or press any key to exit
pause > nul
