# ── Stage 1: Build React Frontend ─────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production Unified Container ─────────────────────────────────────
FROM python:3.11-slim

# Install Node.js 20 and build dependencies for sqlite/postgres/native addons
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg \
    build-essential \
    libpq-dev \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python backend dependencies (FastAPI, NumPy, Pandas, Scipy, Matplotlib, etc.)
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Install Node gateway dependencies
COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm install --omit=dev

# Copy backend code
COPY backend/ ./backend/

# Copy root gateway, startup scripts, and files
COPY index.js run_backend.js schema.sql ./

# Copy built React UI from builder stage
COPY --from=frontend-builder /app/public_react ./public_react

# Expose single unified port
EXPOSE 3330

ENV PORT=3330 \
    BACKEND_PORT=8001 \
    PYTHONUNBUFFERED=1

# Start both FastAPI backend and Node gateway
CMD ["npm", "start"]
