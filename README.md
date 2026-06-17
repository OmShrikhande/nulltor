# Secure LAN Notepad

A shared notepad for two (or more) PCs on the **same Wi‑Fi / LAN**. One PC runs the server; others open it in a browser. Text is **encrypted in the browser** before it is sent — the server only relays encrypted data.

---

## Quick start

### 1. Install (host PC only)

```powershell
cd C:\projects\offline_notepad
npm install
```

### 2. Start the server (host PC)

```powershell
npm run dev
```

You should see:

```
Secure LAN Notepad → http://0.0.0.0:3000
On this PC: http://127.0.0.1:3000
On LAN:     http://192.168.x.x:3000
```

Use your PC’s real LAN IP instead of `192.168.x.x` (see below).

### 3. Host — create the room (first PC, open the page first)

1. Open `http://127.0.0.1:3000` on the **host PC** (or your LAN IP).
2. Stay on **Create Room**.
3. Enter a room key, e.g. `123456789`.
4. Click **Create Room** → the notepad opens.
5. Share the **same key** and **same URL** with the other PC.

### 4. Guest — join (second PC)

1. Open the **same address**, e.g. `http://192.168.31.101:3000`.
2. Click **Join Room**.
3. Enter the **same key** (`123456789`).
4. Click **Join Room**.
5. On the **host PC**, click **Allow** when the popup appears.
6. Both can type, paste, delete, and use emoji.

---

## Find your LAN IP (host PC)

```powershell
ipconfig
```

Look for **IPv4 Address** under your Wi‑Fi adapter, e.g. `192.168.31.101`.

The guest opens: `http://192.168.31.101:3000`

---

## npm commands

| Command | What it does |
|--------|----------------|
| `npm run dev` | Start server with auto-reload (development) |
| `npm start` | Start server once (no auto-reload) |
| `npm run stop` | Free port 3000 if something is already running |
| `npm run restart` | Stop, then start dev server |

**Port already in use?**

```powershell
npm run stop
npm run dev
```

Only **one** server should run on the host PC.

---

## If it is not working

Work through these in order.

### A. Server not running

- Terminal must show `Secure LAN Notepad → http://0.0.0.0:3000`.
- If you see `EADDRINUSE`, run `npm run stop` then `npm run dev`.
- Hard refresh the browser: **Ctrl+F5**.

### B. Guest cannot open the page at all

Usually **network or firewall**, not the app.

#### 1. Same network

- Both PCs must be on the **same Wi‑Fi** (not guest network vs main network).
- Ping from guest to host:

```powershell
ping 192.168.31.101
```

If ping fails (100% loss), fix Wi‑Fi/network first.

#### 2. Windows firewall — allow port 3000 (recommended)

Instead of turning the firewall off, allow the app:

1. Open **Windows Security** → **Firewall & network protection**.
2. **Advanced settings** → **Inbound Rules** → **New Rule**.
3. **Port** → TCP → **3000** → **Allow the connection**.
4. Apply to **Private** (and Domain if needed) → name it e.g. `LAN Notepad`.

Or one-time test rule in PowerShell (run as Administrator):

```powershell
New-NetFirewallRule -DisplayName "LAN Notepad 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

#### 3. Wi‑Fi profile: Public → Private (important on Windows)

Windows **blocks LAN traffic** much more aggressively when the network is **Public**.

1. **Settings** → **Network & internet** → **Wi‑Fi**.
2. Click your connected network.
3. Set **Network profile type** to **Private** (not Public).

Or: **Settings** → **Network & internet** → **Properties** of your Wi‑Fi → **Private network**.

After changing to Private, try the guest URL again.

#### 4. Temporarily disable firewall (test only)

Use this **only to confirm** the problem is the firewall — **turn it back on** after testing.

1. **Windows Security** → **Firewall & network protection**.
2. Turn off **Private network** firewall briefly.
3. Retry `http://HOST_IP:3000` from the guest PC.
4. **Turn the firewall back on**, then add the port rule in step B.2 instead.

#### 5. Antivirus / third-party firewall

Tools like Norton, McAfee, or corporate VPNs can block port 3000. Add an exception for Node.js or port 3000.

### C. Page loads but Create Room / Join Room does nothing

1. Press **F12** → **Console** — look for red errors.
2. Check the **red bar** at the top of the page.
3. On the host terminal you should see logs when you connect:

```
[connect] ...
[host] ...
[create-room] ...
[room-created] salt stored
```

If there are **no logs**, the browser is not reaching your server (firewall/network).

### D. Wrong host / guest role

- The **first browser** that connects becomes **host**.
- The host PC must open the page **before** the guest (or refresh after the server restarts).
- If the second PC opened first, it may have become host by mistake — restart server (`npm run restart`) and open host PC first.

### E. Join works but host never sees Allow popup

- Host must keep the tab open after creating the room.
- Guest must use the **exact same key**.
- Check host terminal for `[guest]` when the second PC connects.

---

## How it works

### High-level flow

```
┌─────────────┐     encrypted text      ┌─────────────┐     encrypted text      ┌─────────────┐
│  Host PC    │ ───────────────────────►│   Server    │ ───────────────────────►│  Guest PC   │
│  (browser)  │ ◄───────────────────────│  Node.js    │ ◄───────────────────────│  (browser)  │
└─────────────┘                         └─────────────┘                         └─────────────┘
     │                                         │                                         │
     │  Plaintext only here                    │  Never sees plaintext                   │  Plaintext only here
     └─ AES encrypt before send                └─ Stores/sends ciphertext only           └─ AES decrypt after receive
```

1. **Host PC** runs `node index.js` (Express + Socket.IO on port **3000**).
2. Browsers load the web UI from the server (`public/`).
3. **Socket.IO** keeps a live connection for instant updates.
4. When you type, the browser **encrypts** the note and sends ciphertext.
5. The server **broadcasts** that ciphertext to other clients.
6. Other browsers **decrypt** with the same room key.

### Create Room logic (host)

1. First connected client is assigned **host** (`host` event).
2. Host picks a **room key** (passphrase) and clicks **Create Room**.
3. Browser generates a random **salt** and sends it to the server (`create-room`).
4. Server saves the salt and notifies everyone (`room-created` / `room-info`).
5. Browser derives an AES key: **PBKDF2**(room key + salt) using CryptoJS.
6. Lock screen closes → notepad is shown.
7. Each keystroke encrypts the full note and emits `y-delta` / `y-snapshot`.

### Join Room logic (guest)

1. Second client connects → **guest** role; host gets a **join request** popup.
2. Guest enters the **same room key** and clicks **Join Room**.
3. Guest fetches the **salt** from the server (`get-room-info`).
4. Guest derives the **same AES key** (same key + same salt).
5. Guest can decrypt anything the host sends.
6. Host clicks **Allow** → guest receives `approved` and can edit.
7. Both sides encrypt outgoing text and decrypt incoming text.

### View modes

| Mode | Behavior |
|------|----------|
| **Normal** | Standard editing |
| **Mask** | Shows digits instead of letters (shoulder-surfing) |
| **Cipher** | Shows encrypted form of the text |

### Server logic (what Node.js does)

| Responsibility | Detail |
|----------------|--------|
| Serve static files | HTML, CSS, JS, CryptoJS |
| WebSocket relay | Socket.IO events between clients |
| Room salt | Stores public salt so all clients derive the same key |
| Host approval | Guest cannot fully sync until host clicks Allow |
| Encrypted snapshot | Last encrypted blob for new joiners |
| Host transfer | If host disconnects, another peer can become host |

The server **does not** decrypt your notes. It only sees encrypted strings.

---

## Security notes

- **LAN encryption:** Text is encrypted before it leaves the browser. Someone sniffing Wi‑Fi sees ciphertext, not your note (if they don’t have the room key).
- **Room key:** Anyone with the key and network access can join — use a strong key on untrusted networks.
- **HTTP:** Traffic is not TLS-wrapped; encryption is **application-level** (AES). For extra transport security, put the app behind HTTPS.
- **Local malware:** Keyloggers on your PC can still capture keys you type — this protects **network** exposure, not a compromised device.
- **Firewall:** Prefer allowing port 3000 on **Private** networks instead of disabling the firewall completely.

---

## Project structure

```
offline_notepad/
├── index.js           # Express + Socket.IO server
├── public/
│   ├── index.html     # UI
│   ├── app.js         # Client logic (rooms, sync, UI)
│   ├── crypto.js      # AES encryption (CryptoJS)
│   └── style.css      # Styles
├── package.json
└── README.md
```

---

## Typical successful session (checklist)

- [ ] Host: `npm run dev` running, no crash
- [ ] Host: Wi‑Fi set to **Private**
- [ ] Host: firewall allows **TCP 3000** (or firewall off for test only)
- [ ] Host: opens page first → **Create Room** → key → notepad opens
- [ ] Guest: `ping HOST_IP` works
- [ ] Guest: opens `http://HOST_IP:3000` → **Join Room** → same key
- [ ] Host: clicks **Allow**
- [ ] Both: typing appears on both sides within a second

---

## License

ISC
