@echo off
REM AI Analytics Setup Script for GradTrack (Windows)
REM This script helps configure the Groq API key for AI-powered analytics

echo ==========================================
echo GradTrack AI Analytics Setup
echo ==========================================
echo.

REM Check if .env file exists
if not exist ".env" (
    echo [X] .env file not found!
    echo Creating .env from .env.example...
    copy .env.example .env
    echo [OK] .env file created
    echo.
)

REM Prompt for API key
echo Please enter your Groq API key:
echo (Get one from: https://console.groq.com/)
set /p GROQ_KEY=

REM Check if key is empty
if "%GROQ_KEY%"=="" (
    echo [X] No API key provided. Exiting...
    pause
    exit /b 1
)

REM Check if GROQ_API_KEY already exists in .env
findstr /C:"GROQ_API_KEY=" .env >nul 2>&1
if %errorlevel%==0 (
    echo Updating existing GROQ_API_KEY...
    powershell -Command "(Get-Content .env) -replace 'GROQ_API_KEY=.*', 'GROQ_API_KEY=%GROQ_KEY%' | Set-Content .env"
) else (
    echo Adding GROQ_API_KEY to .env...
    echo. >> .env
    echo # AI Configuration >> .env
    echo GROQ_API_KEY=%GROQ_KEY% >> .env
)

echo.
echo [OK] AI Analytics configured successfully!
echo.
echo Next steps:
echo 1. Restart your web server (XAMPP Apache)
echo 2. Navigate to Reports ^& Analytics in the admin panel
echo 3. View AI-generated insights in the Overview tab
echo.
echo For more information, see: AI_ANALYTICS_SETUP.md
echo ==========================================
echo.
pause
