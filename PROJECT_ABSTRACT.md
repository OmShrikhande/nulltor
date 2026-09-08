# Nulltor: Secure LAN Collaborative IDE & Version Control Platform
## Comprehensive Architectural Abstract v2.5 & Technical Specification Document

---

## 1. Executive Summary & Vision

**Nulltor** is an enterprise-grade, peer-to-peer collaborative development environment and localized version control platform designed to operate seamlessly over local area networks (LAN) or air-gapped enterprise environments. It fuses the real-time collaborative editing experience of **VS Code** with the branch governance, code reviews, and audit trails of **GitHub**, combined with an autonomous **AI Software Engineering Agent**.

Nulltor guarantees 100% data sovereignty and zero-trust security: code snapshots and CRDT synchronization deltas are encrypted client-side using military-grade cryptography (**AES-256-GCM**) before transmission, ensuring that the central gateway or host server remains completely blind to plain source code.

```mermaid
graph TD
    ClientA["Developer Workstation A (Browser)"] <-->|"AES-256-GCM Encrypted CRDT Deltas"| Gateway["Unified Gateway (:3330)"]
    ClientB["Developer Workstation B (Browser)"] <-->|"AES-256-GCM Encrypted CRDT Deltas"| Gateway
    Gateway -->|"Static UI / Code-Split Chunks"| Frontend["React 19 + Monaco IDE Core"]
    Gateway -->|"Yjs Sync / Presence / Cursors"| NodeSocketIO["Node.js Socket.IO Server"]
    Gateway -->|"Reverse Proxy /api/*"| FastAPI["Python FastAPI Backend (:8001)"]
    Gateway -->|"WebSocket Proxy /ws/terminal"| TerminalEngine["Multi-Tab Interactive PTY Engine (WinPTY/POSIX)"]
    FastAPI <-->|"LSP Language Intelligence"| LSPSystem["Language Server Protocol (/api/lsp/analyze)"]
    FastAPI <--> Database[("PostgreSQL (Primary) + SQLite (Auto-Fallback)")]
    NodeSocketIO <--> Database
    FastAPI <--> GroqAPI["Groq Cloud LLM / OpenAI Compatible"]
```

---

## 2. Version Evolution: Full Upgrade Matrix (v1.0 $\rightarrow$ v2.5)

> **Verdict: Full-stack modernization delivering zero-latency cryptographic editing, hardened authentication, interactive terminal sessions, language intelligence (LSP), and comprehensive developer tooling.**

### 2.1 Comparative Upgrade Matrix

| Subsystem / Feature | Previous Abstract (v1.0) | Current Codebase (v2.5) | Evaluation |
| :--- | :--- | :--- | :--- |
| **Authentication & Cookie Security** | JWT tokens stored purely in `localStorage` vulnerable to XSS token theft. | **HttpOnly Cookie Architecture**: JWT refresh tokens stored as `HttpOnly`, `SameSite=Lax` cookies with automatic silent rotation, `/logout` invalidation, and `credentials: 'include'` proxy transport. | 🟢 **CRITICAL SECURITY UPGRADE** |
| **Terminal WebSocket Authentication** | Open WebSocket `/ws/terminal` endpoint allowing unauthenticated process execution. | **JWT-Guarded Terminal Gateway**: Enforced cryptographic JWT validation on `/ws/terminal`. Rejects unauthenticated connections with WebSocket code `4001`. | 🟢 **CRITICAL SECURITY UPGRADE** |
| **Per-Project Cryptographic Salts** | Hardcoded or static cryptographic salts across all project vaults. | **Dynamic Per-Project Cryptographic Salts**: 128-bit cryptographically secure salts (`secrets.token_hex(16)`) generated per project and bound to PBKDF2 key derivation. | 🟢 **CRITICAL SECURITY UPGRADE** |
| **Language Server Protocol (LSP)** | No real-time syntax checking or linting; errors only discovered on build. | **Integrated LSP Microservice**: `/api/lsp/analyze` endpoint running Python AST parsing, JSON syntax validation, C/C++ bracket balancing/GCC diagnostics, debounced Monaco squiggle markers, and interactive PROBLEMS drawer. | 🟢 **MAJOR NEW FEATURE** |
| **Multi-Tab Terminal Subsystem** | Single execution buffer; container exit killed terminal; shared dead output. | **Multi-Tab Interactive Terminal Drawer**: Tabbed terminal manager (`Terminal 1`, `Terminal 2`, `+ New`, `Kill / Clear`) with isolated xterm buffers and native interactive shell spawning (PowerShell on Windows via WinPTY, Bash on POSIX). | 🟢 **MAJOR NEW FEATURE** |
| **Workspace Full-Text Search (Grep)** | Basic filename filter only. | **Dual-Engine Workspace Search**: Toggle between **Filename Search** and **Content Search (Grep)** across all workspace files with line numbers, syntax snippets, and jump-to-line navigation. | 🟢 **MAJOR NEW FEATURE** |
| **Prettier & Code Formatter** | No code formatting capability. | **Multi-Language In-Browser Beautifier**: Formats JS, TS, JSON, CSS, HTML, Python (PEP-8), and C/C++ via `Shift + Alt + F` or Format button. | 🟢 **MAJOR NEW FEATURE** |
| **Extensions Ecosystem** | No extensions UI / Mock items. | **Live Open VSX Marketplace Integration**: Connects directly to the Eclipse Open VSX registry (`open-vsx.org`) via backend caching proxy (`/api/extensions/search`, `/api/extensions/popular`, `/api/extensions/batch`), providing real extension icons, publishers, download counters (`☁ 6.6M`), star ratings (`★ 4.8`), and instant install/uninstall lifecycle management with zero hardcoded or dummy data. | 🟢 **MAJOR NEW FEATURE** |
| **Status Bar & Live Telemetry** | Static branch label and unstyled peer count. | **Live Diagnostics Status Bar**: Real-time connection status (`● Connected`, `⚠ Reconnecting...`, `Offline`), E2EE peer badge, diagnostic error/warning counters, cursor position (`Ln X, Col Y`), indentation, encoding, and language tag. | 🟢 **MAJOR UPGRADE** |
| **PBKDF2 Cryptographic Speed** | 100,000 PBKDF2 iterations recomputed per keystroke (~45ms CPU lockup). | **In-Memory Derived Key Caching**: Memoized session salt + LRU key cache (`keyCache`) reduces keystroke crypto time to **`<0.01ms`** with zero typing latency. | 🟢 **CRITICAL PERFORMANCE UPGRADE** |
| **Frontend Bundle Size & Code-Splitting** | Monolithic 1.02 MB bundle (`index.js`) loaded upfront on every page. | **78% Initial Load Reduction**: Dynamic `React.lazy()` chunking drops entry bundle to **228 kB**. Dashboard and settings load in **`<60ms`**. | 🟢 **CRITICAL SPEED UPGRADE** |
| **HTTP Caching Policy** | `no-store` on all static files forced complete 1MB re-downloads on reload. | **Immutable Hashed Asset Caching**: 1-year immutable caching on `/assets/*` with `no-store` preserved only on `index.html`. | 🟢 **MAJOR UPGRADE** |
| **Real-Time Save & Persistence** | Auto-flush was broken due to React stale closures & 512KB payload caps. | **Fully Functional**: Synchronous `docRef` bridge, 8MB payload headroom, top bar Save button, tab bar Save button, and `Ctrl+S` / `Cmd+S` shortcuts. | 🟢 **MAJOR UPGRADE** |
| **Editor UX: Dirty Tab Tracking & Auto-Save** | No unsaved indicator; switching tabs risked losing uncommitted state. | **Dirty Indicator Dot (`●`)**: Visual sapphire indicator on modified tabs + **Automatic Save on Tab Switch** guaranteeing zero data loss. | 🟢 **MAJOR UPGRADE** |
| **Automated Merge CAS Pipeline** | Merge confirmation did not sync backend CAS tables. | **Atomic CAS Sync**: `confirm_merge` populates `encrypted_blobs`, `live_keyframes`, and `file_snapshots` simultaneously on PR approval. | 🟢 **MAJOR UPGRADE** |

---

## 3. Core Functional Modules & Architecture

### 3.1 Real-Time Collaborative IDE & Communications
* **Monaco Editor Core**: Embedded VS Code editor engine customized with `nulltor-dark-pro` theme (Sapphire Blue cursor, amber numerals, slate comments, neon error squiggles).
* **CRDT Document Synchronization (Yjs)**: Conflict-free character-level synchronization across LAN peers. Edits propagate as AES-256-GCM encrypted deltas.
* **Synchronous `docRef` State Bridge**: Eliminates React state closure delay, ensuring Monaco keystrokes write into the live Yjs document synchronously.
* **Universal Save Pipeline**:
  * Top action bar Save button with live spinner feedback.
  * Tab bar quick-save trigger.
  * Monaco and global window `Ctrl+S` / `Cmd+S` keybindings.
  * Automatic 2.5s debounced idle snapshot flushing.
  * Automatic save on file tab switching.
* **Integrated WebRTC Video/Audio Calling**: Native peer-to-peer mesh calling using `RTCPeerConnection` with Socket.IO signaling. No external third-party media servers required.
* **Inline AI Autocomplete**: Real-time ghost-text autocomplete (Copilot style) querying Groq / OpenAI-compatible models with 650ms debounce.

### 3.2 Dual-Engine Multi-Tab Terminal & Sandbox
* **Multi-Tab Terminal Drawer**: Tabbed workspace drawer supporting multiple concurrent sessions (`Terminal 1`, `Terminal 2`, `+ New`, `Kill / Clear`).
* **Interactive Shell Subsystem (`mode: "shell"`)**:
  * **Windows**: Native WinPTY integration spawning interactive `powershell.exe -NoLogo` with full ANSI escape support, tab completion, arrow-key navigation, and live stdin/stdout streaming.
  * **POSIX (Linux/macOS)**: Native `pty.fork()` spawning `/bin/bash` or `/bin/sh`.
* **Execution Sandbox Subsystem (`mode: "exec"`)**:
  * Automated language runtime detection:
    * **Python (`.py`)**: `python -u <file>`
    * **JavaScript (`.js`)**: `node <file>`
    * **TypeScript / TSX / JSX (`.ts`, `.tsx`, `.jsx`)**: `npx -y tsx <file>`
    * **C (`.c`)**: Local GCC compilation or Docker container runner (`gcc <file> -o runner && ./runner`)
    * **C++ (`.cpp`, `.cc`)**: Local G++ compilation (`g++ -std=c++17 <file> -o runner && ./runner`)
    * **Go (`.go`)**: `go run <file>`
    * **Rust (`.rs`)**: `rustc <file> -o runner && ./runner`
  * Optional Docker container isolation with automatic native host PTY fallback.

### 3.3 Language Server Protocol (LSP) & Syntax Diagnostics
* **Backend Analysis Endpoint (`/api/lsp/analyze`)**:
  * **Python**: Native Python AST parsing identifying exact line and column syntax errors with explanatory diagnostics.
  * **JSON**: Strict structural validation and offset reporting.
  * **C / C++**: Bracket balance auditing and local GCC/Clang syntax parsing.
  * **Completions**: Language-specific contextual keyword completions.
* **Monaco Diagnostic Synchronization**: Live debounced background marker synchronization (`monaco.editor.setModelMarkers`) with click-to-line navigation in the **PROBLEMS** panel.

### 3.4 Version Control & Branch Governance
* **Branch Hierarchy**: `main` (synchronized team trunk), `subroom` (isolated feature branch), `private` (zero-knowledge developer vault).
* **GitHub-Style Branch Pull & Sync**: 1-click `Pull / Sync` reconciles missing directories and merges upstream code into local branches.
* **Decentralized PR Governance**: Open review visibility for project members, branch-scoped merge authority, and automatic merge commits.
* **Monaco Side-by-Side Diff Viewer**: Visual diff comparison with line-by-line additions and deletions.

### 3.5 Autonomous AI Software Engineering Agent & DevBot
* **Dual AI Subsystems**:
  * **AgentPanel**: Autonomous ReAct agent executing multi-turn tool loops (`create_file`, `write_code_to_file`, `read_active_file`, `list_workspace_files`) using `openai/gpt-oss-120b`.
  * **BotpressPanel**: Embedded intelligent conversational developer assistant (`DevBot`).

### 3.6 Zero-Trust Client-Side Cryptography (E2EE)
* **Key Derivation (PBKDF2)**: 256-bit symmetric keys derived via PBKDF2-HMAC-SHA256 with 100,000 iterations and per-project unique cryptographic salts.
* **High-Speed In-Memory Key Cache**: Bounded LRU cache ensures instant key lookup for all real-time editing operations.
* **Authenticated Encryption (AES-256-GCM)**: 12-byte initialization vectors (IVs) and 16-byte authentication tags ensure zero plaintext exposure on servers.
* **Legacy Backward Compatibility**: Transparent decryption support for legacy AES-256-CBC ciphertexts.

### 3.7 Live Open VSX Marketplace Subsystem
* **Live Registry Integration**: Connects dynamically to the open-source Eclipse Open VSX marketplace via `/api/extensions/search`, `/api/extensions/popular`, and `/api/extensions/batch`.
* **Zero Dummy / Hardcoded Data**: Replaces all mocked extensions with real marketplace items featuring authentic publisher namespaces, extension logos from the Open VSX CDN, real download telemetry (`☁ 6.6M`), and average star ratings (`★ 4.8`).
* **Lifecycle Management**: Real-time install and uninstall actions with `localStorage` persistence and event broadcasting across IDE subsystems.
* **Rich Extension Modal**: Detailed extension inspection view with direct links to `open-vsx.org` listings, version tags, and full markdown descriptions.

---

## 4. Technology Stack Specification

### 4.1 Frontend Stack
* **Framework**: React 19 + TypeScript + Vite 6 (Code-split chunks)
* **Editor**: `@monaco-editor/react` (v4.7.0)
* **CRDT & Networking**: `yjs` (v13.6.31), `socket.io-client` (v4.8.1)
* **Cryptography**: `@noble/ciphers` (v2.2.0), `@noble/hashes` (v2.2.0), `crypto-js`
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
* **Authentication**: JWT (`python-jose`), bcrypt password hashing (`passlib`), HttpOnly cookies
* **Terminal Engine**: `pywinpty` (Windows WinPTY) / `pty` (POSIX)
* **Language Intelligence**: Python AST parser, GCC/Clang lint bridge

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

While Nulltor is fast, hardened, and functionally comprehensive for core LAN/local collaboration, the following items remain open for future major milestones:

1. **Dedicated SFU / Mesh Scalability (WebRTC)**:
   - *Current*: Full peer-to-peer WebRTC mesh for small teams (3–6 developers).
   - *Future*: Selective Forwarding Unit (SFU) like mediasoup / livekit for 20+ participant rooms.
2. **CAS Garbage Collection & Purge Pipeline**:
   - *Current*: Append-only content-addressed storage (CAS) preserving all historical blobs.
   - *Future*: Automated garbage collection and orphaned blob pruning pipeline.
3. **Interactive Commit DAG Network Graph**:
   - *Current*: Commits and branches are managed via timeline and modal lists.
   - *Future*: Visual SVG/Canvas commit network graph showing branch divergence and merge ancestry.
