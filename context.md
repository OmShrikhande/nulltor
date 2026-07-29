# Nulltor IDE Architecture Context

## Project Overview
Nulltor has evolved from a simple offline notepad into a full local-network IDE combining VS Code-style editing with GitHub-style project management. It retains its core end-to-end encrypted (E2EE) real-time collaboration engine, ensuring the server never sees plaintext data.

## Architecture
The system consists of three main components:

1. **FastAPI Backend (`backend/`)**
   - Handles REST API for user authentication, project management, directory tree navigation, and audit logs.
   - Manages the GitHub-style branching model (`main`, `subroom`, `private`) and merge request workflows.
   - Uses PostgreSQL (via async SQLAlchemy) to store structured relational data.
   - Runs on port `8000`.

2. **Node.js Sync Server (`index.js`)**
   - Serves as the high-throughput WebSocket server via Socket.IO for real-time collaboration.
   - Relays encrypted Yjs CRDT payloads between clients.
   - Persists encrypted Yjs document snapshots to the PostgreSQL `file_snapshots` table for durability.
   - Handles branch-scoped rooms (`fileId::branchId`) so each branch maintains an independent edit history.
   - Runs on port `3000`.

3. **React Frontend (`frontend/`)**
   - Built with Vite, React, TypeScript, and Zustand (for state management).
   - Features a VS Code-style three-pane UI: File Explorer, Monaco Editor, and (upcoming) AI Agent panel.
   - Manages client-side AES encryption/decryption using CryptoJS (PBKDF2 key derivation).
   - Handles CRDT conflict resolution in the browser using `yjs` and `y-monaco`.
   - Runs on port `5173` (dev) or served statically in production.

## Key Concepts

- **Branching Model:** 
  - `main`: The shared canonical room visible to all project members.
  - `subroom`: A collaborative feature branch that specific members can be invited to.
  - `private`: A personal fork visible only to the creator.
- **Merge Workflow:** Users initiate a merge from a source branch to a target branch. The browser performs a local CRDT merge, and an encrypted snapshot is saved as a pending merge request. Project leads review and confirm the merge.
- **End-to-End Encryption (E2EE):** The server only relays and stores base64-encoded encrypted strings. Decryption requires the project's shared passphrase/salt, which is never transmitted to the server.
- **Directory Tree:** Files and folders are organized hierarchically and scoped by `branch_id`.

## Database Schema (PostgreSQL)
- `users`: User accounts and roles (`superadmin`, `admin`, `member`).
- `projects`: Top-level workspaces.
- `memberships`: User-to-project access control (`lead`, `member`).
- `branches`: Branches within a project (`main`, `subroom`, `private`).
- `branch_members`: Access control for `subroom` branches.
- `directories`: The file/folder tree, scoped by branch.
- `merge_requests`: Lifecycle tracking for merging branch changes.
- `file_snapshots`: Raw encrypted Yjs state managed by Node.js, keyed by `(file_id, branch_id)`.
- `audit_logs`: Detailed activity tracking across the system.
