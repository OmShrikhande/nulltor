#!/usr/bin/env bash
set -e

echo "========================================================"
echo "  Starting Nulltor Secure Collaborative IDE Platform"
echo "========================================================"
echo ""

# Check dependencies
command -v node >/dev/null 2>&1 || { echo >&2 "[ERROR] Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo >&2 "[ERROR] Python 3 is required. Install from https://python.org"; exit 1; }

# Setup Python venv if missing
if [ ! -d "backend/venv" ]; then
    echo "[1/4] Setting up Python virtual environment..."
    python3 -m venv backend/venv
    backend/venv/bin/pip install --upgrade pip
    echo "Installing backend dependencies (FastAPI, NumPy, Pandas, Scipy, Matplotlib)..."
    backend/venv/bin/pip install -r backend/requirements.txt
fi

# Install dependencies if missing
if [ ! -d "node_modules" ]; then
    echo "[2/4] Installing Node.js dependencies..."
    npm install
fi

# Build React frontend if missing
if [ ! -d "public_react" ]; then
    echo "[3/4] Building React Frontend UI..."
    npm run build
fi

echo "[4/4] Launching Nulltor on Unified Port 3330..."
echo ""
echo "========================================================"
echo "  ACCESS NULLTOR IN YOUR BROWSER:"
echo "  Local:   http://localhost:3330"
echo "========================================================"
echo ""

npm start
