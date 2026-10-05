@echo off
echo ================================
echo   Chaupar - Ludo Online Server
echo ================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please download and install from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    echo.
    call npm install
    echo.
)

REM Start the server
echo Starting Ludo server...
echo.
echo Server will run on: http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo ================================
echo.

node server.js

pause
