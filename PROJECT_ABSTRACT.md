# Nulltor: Secure LAN Collaborative IDE & Version Control Platform
## Comprehensive Architectural Abstract v2.1 & Technical Specification Document

---

## 1. Executive Summary & Vision

**Nulltor** is an enterprise-grade, peer-to-peer collaborative development environment and localized version control platform designed to operate seamlessly over local area networks (LAN) or air-gapped enterprise environments. It fuses the real-time collaborative editing experience of **VS Code** with the branch governance, code reviews, and audit trails of **GitHub**, combined with an autonomous **AI Software Engineering Agent**.

Nulltor ensures 100% data sovereignty and zero-trust security: code snapshots and CRDT synchronization deltas are encrypted client-side using military-grade cryptography (**AES-256-GCM**) before transmission, ensuring that the central node or server remains completely blind to plain source code.

```mermaid
graph TD
    ClientA["Developer Workstation A"] <-->|"AES-256-GCM Encrypted CRDT Deltas"| Gateway["Unified Gateway (:3330)"]
    ClientB["Developer Workstation B"] <-->|"AES-256-GCM Encrypted CRDT Deltas"| Gateway
    Gateway -->|"Static UI / Code-Split Chunks"| Frontend["React 19 + Monaco IDE"]
    Gateway -->|"Yjs Sync / Presence / Cursors"| NodeSocketIO["Node.js Socket.IO Server"]
    Gateway -->|"Reverse Proxy /api/*"| FastAPI["Python FastAPI Backend (:8001)"]
    Gateway -->|"WebSocket Proxy /ws/terminal"| TerminalEngine["Dual-Engine Terminal Sandbox"]
    FastAPI <--> Database[("PostgreSQL (Primary) + SQLite (Auto-Fallback)")]
    NodeSocketIO <--> Database
    FastAPI <--> GroqAPI["Groq Cloud LLM / OpenAI Compatible"]
```

---

## 2. Version Evolution: Abstract v1.0 $\rightarrow$ v2.1 (Full Upgrade Matrix)

> **Verdict: Substantial Upgrade across all performance, architectural, and developer UX dimensions.**

### 2.1 Comparative Upgrade Matrix

| Subsystem / Feature | Previous Abstract (v1.0) | Current Codebase (v2.1) | Evaluation |
| :--- | :--- | :--- | :--- |
| **PBKDF2 Cryptographic Speed** | 100,000 PBKDF2 iterations recomputed per keystroke (~45ms CPU lockup). | **In-Memory Derived Key Caching**: Memoized session salt + LRU key cache (`keyCache`) reduces keystroke crypto time to **`<0.01ms`** with zero typing latency. | 🟢 **CRITICAL PERFORMANCE UPGRADE** |
| **Frontend Bundle Size & Code-Splitting** | Monolithic 1.02 MB bundle (`index.js`) loaded upfront on every page. | **78% Initial Load Reduction**: Dynamic `React.lazy()` chunking drops entry bundle to **228 kB**. Dashboard and settings load in **`<60ms`**. | 🟢 **CRITICAL SPEED UPGRADE** |
| **HTTP Caching Policy** | `no-store` on all static files forced complete 1MB re-downloads on reload. | **Immutable Hashed Asset Caching**: 1-year immutable caching on `/assets/*` with `no-store` preserved only on `index.html`. | 🟢 **MAJOR UPGRADE** |
| **Real-Time Save & Persistence** | Auto-flush was broken due to React stale closures & 512KB payload caps. | **Fully Functional**: Synchronous `docRef` bridge, 8MB payload headroom, top bar Save button, tab bar Save button, and `Ctrl+S` / `Cmd+S` shortcuts. | 🟢 **MAJOR UPGRADE** |
| **Editor UX: Dirty Tab Tracking & Auto-Save** | No unsaved indicator; switching tabs risked losing uncommitted state. | **Dirty Indicator Dot (`●`)**: Visual sapphire indicator on modified tabs + **Automatic Save on Tab Switch** guaranteeing zero data loss. | 🟢 **NEW FEATURE** |
| **Workspace Full-Text Search** | Basic unstyled file filter. | **Advanced Workspace Search**: Breadcrumb path previews, Match Case (`Aa`), Match Word (`\b`), and Regular Expression (`.*`) filter toggles. | 🟢 **NEW FEATURE** |
| **Workspace Multi-File Commits** | Commits restricted to active single file only. | **Workspace Revisions**: Atomic multi-file workspace commits snapshotting active project files simultaneously. | 🟢 **NEW FEATURE** |
| **Automated Merge CAS Pipeline** | Merge confirmation did not sync backend CAS tables. | **Atomic CAS Sync**: `confirm_merge` populates `encrypted_blobs`, `live_keyframes`, and `file_snapshots` simultaneously on PR approval. | 🟢 **MAJOR UPGRADE** |
| **Database-Persisted User Settings** | Settings lost on browser cache clear (`localStorage` only). | **Cloud/DB Synchronization**: Preferences stored in PostgreSQL/SQLite (`/api/users/me/preferences`) and synced across devices. | 🟢 **NEW FEATURE** |
| **Terminal Execution Engine** | Double-invoked Node binary on Windows causing DOS `MZ` SyntaxError. | **Fixed & Multi-Runtime**: Clean PTY routing for JS (`node`), TS/TSX/JSX (`npx -y tsx`), and Python (`python -u`) across Windows and POSIX. | 🟢 **MAJOR UPGRADE** |
| **Zero-Setup Bootstrapping** | Fragmented `.bat`/`.sh` scripts requiring manual venv & build steps. | **Universal `npm start`**: Auto-detects Python, creates `backend/venv`, installs `requirements.txt`, checks frontend build, and boots uvicorn + gateway. | 🟢 **MAJOR UPGRADE** |
| **Database Schema Completeness** | Missing core v2 tables (`encrypted_blobs`, `branch_manifests`, `commits_v2`, `commit_file_deltas`). | **100% Complete**: `schema.sql` and SQLite migrations initialize all v2 CAS tables cleanly on first launch. | 🟢 **MAJOR UPGRADE** |

---

## 3. Core Functional Modules & Architecture

### 3.1 Real-Time Collaborative IDE & Communications
* **Monaco Editor Engine**: Embedded VS Code editor core with custom `nulltor-dark-pro` theme (Sapphire Blue cursor, amber numerals, slate comments).
* **CRDT Document Synchronization (Yjs)**: Conflict-free character-level synchronization across LAN peers. Edits propagate as AES-256 encrypted deltas.
* **Synchronous `docRef` State Bridge**: Eliminates React state closure delay, ensuring Monaco keystrokes write into the live Yjs document synchronously.
* **Universal Save Pipeline**:
  * Top action bar Save button with live spinner feedback.
  * Tab bar quick-save trigger.
  * Monaco and global window `Ctrl+S` / `Cmd+S` keybindings.
  * Automatic 2.5s debounced idle snapshot flushing.
  * Automatic save on file tab switching.
* **Integrated WebRTC Video/Audio Calling**: Native peer-to-peer mesh calling using `RTCPeerConnection` with Socket.IO signaling. No external third-party media servers required.
* **Inline AI Autocomplete**: Real-time ghost-text autocomplete (Copilot style) querying Groq / OpenAI-compatible models with 650ms debounce.

### 3.2 Dual-Engine Interactive Terminal & Sandbox
* **Interactive Terminal (xterm.js)**: Full-duplex WebSocket PTY streaming standard I/O and ANSI escapes.
* **Dynamic Language Routing**:
  * **JavaScript (`.js`)**: `node <file>`
  * **TypeScript / JSX / TSX (`.ts`, `.tsx`, `.jsx`)**: `npx -y tsx <file>`
  * **Python (`.py`)**: `python -u <file>`
* **Container Isolation & Host Fallback**: Supports isolated Docker container execution with automated fallback to native host PTY (`pywinpty` / POSIX `pty`).

### 3.3 Version Control & Branch Governance
* **Branch Hierarchy**: `main` (synchronized team trunk), `subroom` (isolated feature branch), `private` (zero-knowledge developer vault).
* **GitHub-Style Branch Pull & Sync**: 1-click `Pull / Sync` reconciles missing directories and merges upstream code into local branches.
* **Decentralized PR Governance**: Open review visibility for project members, branch-scoped merge authority, and automatic merge commits.
* **Monaco Side-by-Side Diff Viewer**: Side-by-side visual diff comparison with line-by-line additions and deletions.

### 3.4 Autonomous AI Software Engineering Agent
* **ReAct Agentic Loop**: Multi-turn tool execution loop using `openai/gpt-oss-120b`.
* **Workspace Tooling**: `create_file`, `write_code_to_file`, `read_active_file`, `list_workspace_files`.

### 3.5 Zero-Trust Client-Side Cryptography (E2EE)
* **Key Derivation (PBKDF2)**: 256-bit symmetric keys derived via PBKDF2-HMAC-SHA256 with 100,000 iterations.
* **High-Speed In-Memory Key Cache**: Bounded LRU cache ensures instant key lookup for all real-time editing operations.
* **Authenticated Encryption (AES-256-GCM)**: 12-byte initialization vectors (IVs) and 16-byte authentication tags ensure zero plaintext exposure on servers.
* **Legacy Backward Compatibility**: Transparent decryption support for legacy AES-256-CBC ciphertexts.

---

## 4. Technology Stack Specification

### 4.1 Frontend Stack
* **Framework**: React 19 + TypeScript + Vite 6 (Code-split chunks)
* **Editor**: `@monaco-editor/react` (v4.7.0)
* **CRDT & Networking**: `yjs` (v13.6.31), `socket.io-client` (v4.8.1)
* **Cryptography**: `@noble/ciphers` (v2.2.0), `@noble/hashes` (v2.2.0)
* **Terminal**: `@xterm/xterm` (v5.5.0), `@xterm/addon-fit` (v0.8.0)
* **State Management**: `zustand` (v5.0.3)
* **Styling & Icons**: Custom Vanilla CSS Design System + `lucide-react` (v0.475.0)

### 4.2 Gateway & Real-Time Sync Server
* **Server**: Node.js + Express 5 + Socket.IO (v4.8.3, 8MB max payload buffer)
* **Reverse Proxy**: `http-proxy-middleware` (v4.2.0)
* **Storage Drivers**: `pg` (v8.23.0), `sqlite3` (v6.0.1)
* **Discovery**: `multicast-dns` (v7.2.5) for `nulltor.local` advertising

### 4.3 Backend & AI Services
* **Framework**: Python FastAPI + Uvicorn
* **ORM & Database**: SQLAlchemy 2.0 Async + `asyncpg` + `aiosqlite`
* **Authentication**: JWT (`python-jose`), bcrypt password hashing (`passlib`)
* **Terminal Engine**: `pywinpty` (Windows) / `pty` (POSIX)

---

## 5. System Execution Models

| Deployment Mode | Command | Description |
| :--- | :--- | :--- |
| **Universal Local Startup** | `npm start` | Self-healing bootstrap: creates virtual env, installs dependencies, verifies frontend build, and starts FastAPI + Gateway on `http://localhost:3330`. |
| **Universal Production Docker** | `docker compose up --build` | Launches containerized Gateway + FastAPI + PostgreSQL on single unified port `3330`. |
| **Hot-Reload Dev Docker** | `npm run docker:dev` | Volume-mounted live development with instant code reloading. |
| **Process Cleanup** | `npm run stop` | Cross-platform port cleaner terminating active processes on ports 3330, 8001, and 3000. |

---

## 6. What Nulltor Lacks (Next Enterprise Frontier)

While Nulltor is now fast, stable, and functionally complete for core LAN/local collaboration, the following areas represent what the platform currently lacks to compete with full enterprise cloud SaaS solutions:

### 6.1 Advanced Version Control & Branch Visualizer
* **Visual Git DAG / Commit Network Graph**:
  * *Current*: Commits and branches are listed in tabular/dropdown format.
  * *Missing*: An interactive visual commit graph (like GitHub Network Graph or GitKraken) showing branches diverging, merge nodes, and parent-child commit lineage.
* **Branch Protection Rules & PR Policies**:
  * *Current*: Any team member on `main` can approve and merge PRs.
  * *Missing*: Configurable branch rules (e.g. require minimum 2 peer approvals, require clean terminal test run before merging, restrict `main` branch force pushes).

### 6.2 Collaborative Polish & Remote Cursors
* **Monaco Remote Selection Range Highlights**:
  * *Current*: Remote peers are represented by cursor position badges (line/column).
  * *Missing*: Rendering colored background selection highlights in Monaco showing the exact multi-line text blocks other collaborators currently have highlighted or selected.
* **File Lock / Soft-Advisory Markers**:
  * *Current*: Completely conflict-free concurrent editing via CRDT.
  * *Missing*: Optional soft-advisory indicators notifying when 2+ engineers are editing the exact same function or line range simultaneously.

### 6.3 Enterprise Administration & Compliance
* **Audit Log Export & Temporal Filtering**:
  * *Current*: High-density audit table with JSON drawers.
  * *Missing*: 1-click CSV/JSON export and date-range / IP range filtering for corporate compliance audits.
* **Granular Role-Based Access Control (RBAC)**:
  * *Current*: Fixed roles (`superadmin`, `admin`, `member`).
  * *Missing*: Custom project-scoped roles (`Viewer`, `Reviewer`, `Maintainer`, `Billing Admin`) with granular read/write/merge ACLs.
* **E2EE Key Rotation Mechanism**:
  * *Current*: Symmetric encryption key is derived directly from project passphrase.
  * *Missing*: Zero-downtime key rotation workflow to re-encrypt CAS blobs with a new passphrase when a team member leaves the project.
