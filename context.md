# Secure LAN Notepad Context

## Project Overview
A shared offline notepad designed for two or more PCs on the same Wi-Fi / LAN network. It allows users to write notes synchronously with end-to-end encryption. The text is encrypted in the browser before being sent, ensuring the server only relays encrypted data.

## Architecture
- **Backend:** Node.js server using Express for serving static files and Socket.IO for real-time WebSocket communication.
- **Frontend:** Vanilla HTML, CSS, and JavaScript (located in the `public/` directory).
- **Real-time Sync:** Uses `yjs` (CRDT - Conflict-free Replicated Data Type) to handle concurrent edits seamlessly between multiple clients.
- **Encryption:** AES encryption (using CryptoJS) is done entirely on the client side. The server never sees the plaintext, only the encrypted strings.

## Directory Structure
- `index.js`: The entry point for the Node.js server. It sets up Express, Socket.IO, handles room creation, host/guest role management, host approval, and broadcasting encrypted Yjs updates (`y-delta` and `y-snapshot`).
- `package.json`: Contains project metadata, npm scripts, and dependencies (like `express`, `socket.io`, `yjs`, `crypto-js`).
- `public/`: Contains the frontend UI and logic.
  - `index.html`: The main user interface, including normal, mask, and cipher view modes.
  - `app.js`: Main client-side logic for room management and UI interaction.
  - `collab.js`: Collaboration logic, bridging Yjs and Socket.IO.
  - `crypto.js`: Handles PBKDF2 key derivation and AES encryption/decryption.
  - `style.css`: Stylesheet for the application.

## Key Concepts
- **Host:** The first user to connect to the server becomes the host. The host sets the room key (passphrase) and must explicitly approve joining guests.
- **Guest:** Secondary users who connect. They must enter the exact same room key and wait for the host's approval.
- **End-to-End Encryption (E2EE):** The host's browser generates a random salt and sends it to the server. Guests fetch this salt and use it along with the shared room key to derive the same AES key (via PBKDF2).
- **Data Flow:** Keystroke -> Yjs creates delta -> Browser encrypts delta -> Socket.IO emits `y-delta` -> Server broadcasts -> Other browser receives -> Decrypts -> Applies delta to local Yjs document -> UI updates.
