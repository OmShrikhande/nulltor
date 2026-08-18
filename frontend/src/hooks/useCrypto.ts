/**
 * useCrypto — client-side AES encryption/decryption
 * Mirrors public/crypto.js using CryptoJS PBKDF2 + AES.
 * The server never sees plaintext — only encrypted strings travel over the wire.
 */
import CryptoJS from 'crypto-js';
import { useMemo } from 'react';

const PBKDF2_ITERATIONS = 10000;
const KEY_SIZE = 256 / 32; // 256-bit key

export function useCrypto(passphrase: string, salt: string) {
  const key = useMemo(() => {
    if (!passphrase || !salt) return null;
    return CryptoJS.PBKDF2(passphrase, salt, {
      keySize: KEY_SIZE,
      iterations: PBKDF2_ITERATIONS,
    });
  }, [passphrase, salt]);

  function encrypt(plaintext: string): string {
    if (!key) throw new Error('Crypto key not ready');
    const iv = CryptoJS.lib.WordArray.random(128 / 8);
    const encrypted = CryptoJS.AES.encrypt(plaintext, key, { iv });
    return iv.toString() + ':' + encrypted.toString();
  }

  function decrypt(ciphertext: string): string {
    if (!key) throw new Error('Crypto key not ready');
    const [ivHex, data] = ciphertext.split(':');
    if (!ivHex || !data) throw new Error('Invalid ciphertext format');
    const iv = CryptoJS.enc.Hex.parse(ivHex);
    const decrypted = CryptoJS.AES.decrypt(data, key, { iv });
    if (decrypted.sigBytes < 0) throw new Error('Decryption failed');
    return decrypted.toString(CryptoJS.enc.Utf8);
  }

  return { encrypt, decrypt, ready: !!key };
}
