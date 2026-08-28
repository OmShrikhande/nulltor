# Nulltor — Cryptographic Collaborative Developer Studio & Real-Time IDE

Nulltor is a high-performance, real-time collaborative code editor and version control platform. It integrates CRDT-based multi-user state synchronization (Yjs), end-to-end encrypted CAS blob storage, interactive in-browser terminal execution, and fine-grained team access governance.

---

## ⚡ Single-Command Startup (All Platforms)

Nulltor is engineered to be **100% platform-agnostic**. Whether on **Windows**, **macOS**, or **Linux**, you can clone and launch everything with a single command.

### Option A: Local Bare-Metal (Recommended for Dev)

```bash
# 1. Clone repository
git clone https://github.com/OmShrikhande/nulltor.git
cd nulltor

# 2. Run Nulltor (Auto-installs dependencies, builds UI, and launches services)
npm start
```

* Nulltor Unified Gateway: **http://localhost:3330**
* FastAPI Documentation: **http://localhost:8001/docs**

> **Default Superadmin Credentials:**  
> **Username:** `superadmin`  
> **Password:** `admin123` *(Change on first login)*

---

### Option B: Docker Container Stack

Run the complete isolated production stack (FastAPI Backend + Node Gateway + PostgreSQL 15 Alpine DB):

```bash
# Launch container stack
docker compose up --build
```

To stop the Docker stack:
```bash
docker compose down
```

---

## 🛠️ Developer Scripts

| Command | Action |
|:---|:---|
| `npm start` | Launches FastAPI backend (port 8001) and Gateway (port 3330) with auto-bootstrapping |
| `npm run dev` | Starts full hot-reloading dev environment (FastAPI + Node Gateway + Vite React UI) |
| `npm run build` | Builds the React frontend into `public_react/` |
| `npm run setup` | Performs complete manual dependency and venv setup |
| `npm run stop` | Cross-platform port cleaner (frees ports 3330, 3000, and 8001 on Windows/Linux/macOS) |
| `npm run docker:up` | Runs `docker compose up --build` |

---

## 🏗️ Architecture & Features

* **Multi-Language Execution Engine**: Run `.js`, `.ts`, `.jsx`, `.tsx`, and `.py` directly in the IDE terminal using Node.js, TSX, or Python with zero OS-specific popups.
* **Real-time Collaboration & Subrooms**: P2P Yjs document synchronization with granular branch isolation and permission-based subroom invitations.
* **Cryptographic Version Control**: Content-Addressable Storage (CAS) with AES-256-GCM encryption, tree manifests, and commit file deltas.
* **Audit & Security Governance**: Live tamper-evident audit telemetry with role-based access control (Superadmin, Admin, Member).
