@echo off
title QuartoReview - Starting...

echo Stopping any processes on ports 3001 and 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 "') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 "') do taskkill /F /PID %%a >nul 2>&1

echo Starting backend...
wscript "%~dp0run_hidden.vbs" "cmd /c cd /d ""%~dp0backend"" && npm start"

echo Starting frontend...
wscript "%~dp0run_hidden.vbs" "cmd /c cd /d ""%~dp0frontend"" && npm start"

echo.
echo Both servers are starting.
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:5173
echo.
echo Opening browser in 5 seconds...
timeout /t 5 >nul
start "" "http://localhost:5173"
