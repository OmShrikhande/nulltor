@echo off
title Nulltor - Secure LAN Collaborative Platform
color 0A

echo ========================================================
echo   Starting Nulltor Secure Collaborative IDE Platform
echo ========================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js (v18+) from https://nodejs.org
    pause
    exit /b 1
)

:: Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed. Please install Python (3.10+) from https://python.org
    pause
    exit /b 1
)

:: Setup Python Virtual Environment if missing
if not exist backend\venv (
    echo [1/4] Setting up Python virtual environment...
    python -m venv backend\venv
    call backend\venv\Scripts\pip install --upgrade pip
    echo Installing backend dependencies (FastAPI, NumPy, Pandas, Scipy, Matplotlib)...
    call backend\venv\Scripts\pip install -r backend\requirements.txt
)

:: Install root dependencies if needed
if not exist node_modules (
    echo [2/4] Installing Node.js dependencies...
    call npm install
)

:: Build frontend if not built yet
if not exist public_react (
    echo [3/4] Building React Frontend UI...
    call npm run build
)

echo [4/4] Launching Nulltor on Unified Port 3330...
echo.
echo ========================================================
echo   ACCESS NULLTOR IN YOUR BROWSER:
echo   Local:   http://localhost:3330
echo ========================================================
echo.

:: Automatically open browser after 2 seconds
start "" timeout /t 2 >nul & start http://localhost:3330

:: Start unified services (FastAPI on 8001 + Node Gateway on 3330)
call npm start
pause
