/* global CryptoJS */
(function () {
    "use strict";

    function toBase64(bytes) {
        const words = CryptoJS.lib.WordArray.create(bytes);
        return CryptoJS.enc.Base64.stringify(words);
    }

    function fromBase64(base64) {
        const words = CryptoJS.enc.Base64.parse(base64);
        const bytes = new Uint8Array(words.sigBytes);
        for (let i = 0; i < words.sigBytes; i++) {
            bytes[i] = (words.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        }
        return bytes;
    }

    class SecureVault {
        constructor() {
            this.key = null;
        }

        unlock(passphrase, saltBase64) {
            if (!passphrase) throw new Error("Enter a room key");
            if (!saltBase64) throw new Error("Room not ready yet");

            const salt = CryptoJS.enc.Base64.parse(saltBase64);
            this.key = CryptoJS.PBKDF2(passphrase, salt, {
                keySize: 256 / 32,
                iterations: 10000,
                hasher: CryptoJS.algo.SHA256
            });
        }

        static createSaltBase64() {
            return CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.random(16));
        }

        isUnlocked() {
            return this.key !== null;
        }

        encryptText(text) {
            if (!this.key) throw new Error("Vault is locked");
            const iv = CryptoJS.lib.WordArray.random(16);
            const encrypted = CryptoJS.AES.encrypt(text, this.key, { iv });
            return iv.toString(CryptoJS.enc.Base64) + ":" + encrypted.toString();
        }

        decryptText(payload) {
            if (!this.key) throw new Error("Vault is locked");
            const parts = payload.split(":");
            if (parts.length < 2) throw new Error("Bad payload");
            const iv = CryptoJS.enc.Base64.parse(parts.shift());
            const cipher = parts.join(":");
            const decrypted = CryptoJS.AES.decrypt(cipher, this.key, { iv });
            return decrypted.toString(CryptoJS.enc.Utf8);
        }

        encryptBytes(bytes) {
            const text = toBase64(bytes);
            return this.encryptText(text);
        }

        decryptBytes(payload) {
            const text = this.decryptText(payload);
            return fromBase64(text);
        }

        maskText(text) {
            return [...text].map((char, index) => {
                if (char === "\n" || char === "\t" || char === " ") return char;
                return String((char.codePointAt(0) + index * 7) % 10);
            }).join("");
        }

        cipherPreview(text) {
            return this.encryptText(text).match(/.{1,64}/g).join("\n");
        }
    }

    function randomPeerColor() {
        const colors = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6", "#06b6d4", "#ef4444", "#22c55e"];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    window.SecureVault = SecureVault;
    window.randomPeerColor = randomPeerColor;
})();
