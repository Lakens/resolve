@echo off
title QuartoReview - Installing dependencies...

echo ================================================
echo  QuartoReview - First-time setup
echo ================================================
echo.

:: Check that Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo.
    echo Please download and install Node.js from:
    echo   https://nodejs.org
    echo Choose the LTS version and accept all defaults.
    echo Then run this script again.
    echo.
    pause
    exit /b 1
)

echo Node.js found:
node --version
echo.

echo Installing backend dependencies...
cd /d "%~dp0backend"
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Backend install failed.
    pause
    exit /b 1
)

echo.
echo Installing frontend dependencies...
cd /d "%~dp0frontend"
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Frontend install failed.
    pause
    exit /b 1
)

echo.
echo ================================================
echo  Installation complete!
echo ================================================
echo.
echo Next step: create the file  backend\.env
echo See README.md for instructions on what to put in it.
echo (You need a GitHub OAuth App - takes about 2 minutes.)
echo.
echo Once .env is ready, run  start.bat  to launch the app.
echo.
pause
