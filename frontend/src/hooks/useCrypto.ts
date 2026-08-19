/**
 * useCrypto — client-side AES-256-GCM encryption/decryption
 *
 * Algorithm:  AES-256-GCM  (AEAD — authenticated + encrypted)
 * KDF:        PBKDF2-SHA256, 100,000 iterations, 256-bit key
 * Library:    @noble/ciphers + @noble/hashes (audited, zero-dependency)
 *
 * The server NEVER sees plaintext — only encrypted ciphertext travels the wire.
 * GCM mode provides both confidentiality AND integrity (tamper detection via auth tag).
 *
 * Wire format:  base64( salt[16] | iv[12] | authTag[16] | ciphertext )
 */
import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import CryptoJS from 'crypto-js';
import { useMemo } from 'react';

const PBKDF2_ITERATIONS = 100_000;
const KEY_BYTES = 32; // 256-bit

function passphraseToKey(passphrase: string, salt: Uint8Array): Uint8Array {
  return pbkdf2(sha256, passphrase, salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_BYTES,
  });
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function useCrypto(passphrase: string, _salt: string) {
  // We derive a fresh key per-call using a per-message random salt,
  // so the static _salt param is kept for API compatibility but ignored here.
  const ready = useMemo(() => !!passphrase, [passphrase]);

  function encrypt(plaintext: string): string {
    if (!passphrase) throw new Error('Crypto passphrase not set');

    const salt = randomBytes(16);           // fresh 128-bit salt per message
    const iv   = randomBytes(12);           // fresh 96-bit IV per message (GCM standard)
    const key  = passphraseToKey(passphrase, salt);

    const plaintextBytes = new TextEncoder().encode(plaintext);
    const cipher = gcm(key, iv);
    const sealed = cipher.encrypt(plaintextBytes); // ciphertext + 16-byte auth tag appended

    // Pack: salt | iv | sealed(ciphertext + authTag)
    const packed = new Uint8Array(salt.length + iv.length + sealed.length);
    packed.set(salt, 0);
    packed.set(iv, 16);
    packed.set(sealed, 28);

    return toBase64(packed);
  }

  function decrypt(ciphertext: string): string {
    if (!passphrase) throw new Error('Crypto passphrase not set');

    // Support legacy CryptoJS CBC format ("ivHex:base64data") transparently
    if (ciphertext.includes(':')) {
      return _legacyCBCDecrypt(ciphertext, _salt, passphrase);
    }

    const packed = fromBase64(ciphertext);
    if (packed.length < 28 + 16) throw new Error('Invalid ciphertext: too short');

    const salt   = packed.slice(0, 16);
    const iv     = packed.slice(16, 28);
    const sealed = packed.slice(28);       // ciphertext + authTag

    const key = passphraseToKey(passphrase, salt);
    const cipher = gcm(key, iv);

    // GCM automatically verifies auth tag — throws if tampered
    const plaintextBytes = cipher.decrypt(sealed);
    return new TextDecoder().decode(plaintextBytes);
  }

  return { encrypt, decrypt, ready };
}

/**
 * Legacy compatibility shim — decrypts old AES-256-CBC (CryptoJS) ciphertext.
 * Allows existing stored data to be read. Identified by the "ivHex:data" wire format.
 */
function _legacyCBCDecrypt(ciphertext: string, salt: string, passphrase: string): string {
  try {
    const KEY_SIZE = 256 / 32;
    const key = CryptoJS.PBKDF2(passphrase, salt, { keySize: KEY_SIZE, iterations: 10000 });
    const [ivHex, data] = ciphertext.split(':');
    if (!ivHex || !data) throw new Error('Invalid legacy ciphertext format');
    const iv = CryptoJS.enc.Hex.parse(ivHex);
    const decrypted = CryptoJS.AES.decrypt(data, key, { iv });
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch {
    throw new Error('Failed to decrypt legacy CBC ciphertext.');
  }
}
