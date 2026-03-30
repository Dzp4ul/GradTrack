@echo off
echo ========================================
echo Starting GradTrack Frontend
echo ========================================
echo.

cd frontend

echo Installing dependencies (if needed)...
call npm install

echo.
echo Starting frontend development server...
echo This will open in your browser automatically
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

call npm run dev
