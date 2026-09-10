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

// In-memory LRU-bounded cache for derived keys (passphrase:salt -> 256-bit key)
const keyCache = new Map<string, Uint8Array>();
const MAX_KEY_CACHE_SIZE = 500;

function passphraseToKey(passphrase: string, salt: Uint8Array): Uint8Array {
  const cacheKey = `${passphrase}::${toBase64(salt)}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const derived = pbkdf2(sha256, passphrase, salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_BYTES,
  });

  if (keyCache.size >= MAX_KEY_CACHE_SIZE) {
    const firstKey = keyCache.keys().next().value;
    if (firstKey) keyCache.delete(firstKey);
  }
  keyCache.set(cacheKey, derived);
  return derived;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunkSize, len))));
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function encryptWithPassphrase(plaintext: string, passphrase: string): string {
  if (!passphrase) throw new Error('Crypto passphrase not set');
  const salt = randomBytes(16);
  const iv   = randomBytes(12);
  const key  = passphraseToKey(passphrase, salt);

  const plaintextBytes = new TextEncoder().encode(plaintext);
  const cipher = gcm(key, iv);
  const sealed = cipher.encrypt(plaintextBytes);

  const packed = new Uint8Array(salt.length + iv.length + sealed.length);
  packed.set(salt, 0);
  packed.set(iv, 16);
  packed.set(sealed, 28);

  return toBase64(packed);
}

export function decryptWithPassphrase(ciphertext: string, passphrase: string, saltStr = 'nulltor-salt'): string {
  if (!passphrase) throw new Error('Crypto passphrase not set');

  if (ciphertext.includes(':')) {
    return _legacyCBCDecrypt(ciphertext, saltStr, passphrase);
  }

  const packed = fromBase64(ciphertext);
  if (packed.length < 28 + 16) throw new Error('Invalid ciphertext: too short');

  const salt   = packed.slice(0, 16);
  const iv     = packed.slice(16, 28);
  const sealed = packed.slice(28);

  const key = passphraseToKey(passphrase, salt);
  const cipher = gcm(key, iv);

  const plaintextBytes = cipher.decrypt(sealed);
  return new TextDecoder().decode(plaintextBytes);
}

export function useCrypto(passphrase: string, _salt: string) {
  const ready = useMemo(() => !!passphrase, [passphrase]);
  const defaultSalt = useMemo(() => (passphrase ? randomBytes(16) : new Uint8Array(16)), [passphrase]);

  function encrypt(plaintext: string): string {
    if (!passphrase) throw new Error('Crypto passphrase not set');

    const salt = defaultSalt;               // Fast session-cached salt
    const iv   = randomBytes(12);           // Fresh 96-bit cryptographically random IV per message
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
    return decryptWithPassphrase(ciphertext, passphrase, _salt);
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
