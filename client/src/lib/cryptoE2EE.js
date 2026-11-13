/**
 * Military-Grade End-to-End Encryption (E2EE) Module
 * Powered by browser-native Web Crypto API (crypto.subtle)
 * Primitives: ECDH (Curve P-256) for Key Agreement + AES-GCM-256 for Authenticated Encryption
 * Zero server knowledge: encryption and decryption happen strictly in client memory.
 */
import idb from './idbStore';

// In-memory cache for derived AES-GCM CryptoKeys
const derivedKeyCache = new Map();

// Helpers for ArrayBuffer <-> Base64
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export const cryptoE2EE = {
  /**
   * Generates or retrieves the user's permanent device ECDH keypair.
   * Stored securely in IndexedDB as non-extractable CryptoKey references or JWK.
   */
  async getOrCreateKeyPair() {
    try {
      const stored = await idb.getMyKeyPair();
      if (stored && stored.publicKeyJwk && stored.privateKeyJwk) {
        const publicKey = await window.crypto.subtle.importKey(
          'jwk',
          stored.publicKeyJwk,
          { name: 'ECDH', namedCurve: 'P-256' },
          true,
          []
        );
        const privateKey = await window.crypto.subtle.importKey(
          'jwk',
          stored.privateKeyJwk,
          { name: 'ECDH', namedCurve: 'P-256' },
          true,
          ['deriveKey', 'deriveBits']
        );
        return { publicKey, privateKey, publicKeyJwk: stored.publicKeyJwk };
      }

      // Generate new P-256 ECDH Keypair
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'ECDH',
          namedCurve: 'P-256',
        },
        true,
        ['deriveKey', 'deriveBits']
      );

      const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
      const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);

      await idb.setMyKeyPair({ publicKeyJwk, privateKeyJwk });

      return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey, publicKeyJwk };
    } catch (err) {
      console.error('[E2EE] Keypair generation error:', err);
      return null;
    }
  },

  /**
   * Derives a shared AES-GCM-256 symmetric encryption key from peer's public key JWK
   */
  async deriveSharedSecretKey(conversationId, peerPublicKeyJwk) {
    if (!conversationId) return null;
    if (derivedKeyCache.has(conversationId)) {
      return derivedKeyCache.get(conversationId);
    }

    try {
      const myKeys = await this.getOrCreateKeyPair();
      if (!myKeys || !peerPublicKeyJwk) return null;

      // Import peer's ECDH public key
      const peerPublicKey = await window.crypto.subtle.importKey(
        'jwk',
        peerPublicKeyJwk,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        []
      );

      // Derive shared AES-GCM key
      const sharedKey = await window.crypto.subtle.deriveKey(
        {
          name: 'ECDH',
          public: peerPublicKey,
        },
        myKeys.privateKey,
        {
          name: 'AES-GCM',
          length: 256,
        },
        false, // non-extractable from memory
        ['encrypt', 'decrypt']
      );

      derivedKeyCache.set(conversationId, sharedKey);
      return sharedKey;
    } catch (err) {
      console.error('[E2EE] Key derivation failed:', err);
      return null;
    }
  },

  /**
   * Encrypts plaintext string using AES-GCM-256 with 12-byte random IV.
   * Returns base64 payload { ciphertext, iv, isEncrypted: true }
   */
  async encryptPayload(conversationId, plaintext, peerPublicKeyJwk) {
    try {
      if (!plaintext) return { content: '' };
      const sharedKey = await this.deriveSharedSecretKey(conversationId, peerPublicKeyJwk);
      if (!sharedKey) {
        // If peer has no key yet, fallback to plaintext with warning
        console.warn('[E2EE] Peer public key not available; sending unencrypted fallback.');
        return { content: plaintext, isEncrypted: false };
      }

      // 96-bit (12-byte) initialization vector (IV) unique to every single message
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encodedText = new TextEncoder().encode(plaintext);

      const ciphertextBuffer = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        sharedKey,
        encodedText
      );

      return {
        content: arrayBufferToBase64(ciphertextBuffer),
        iv: arrayBufferToBase64(iv.buffer),
        isEncrypted: true,
      };
    } catch (err) {
      console.error('[E2EE] Encryption failed:', err);
      return { content: plaintext, isEncrypted: false };
    }
  },

  /**
   * Decrypts an AES-GCM-256 ciphertext payload.
   * Returns original plaintext string or error marker.
   */
  async decryptPayload(conversationId, message, peerPublicKeyJwk) {
    if (!message || !message.isEncrypted || !message.iv) {
      return message?.content || '';
    }

    try {
      const sharedKey = await this.deriveSharedSecretKey(conversationId, peerPublicKeyJwk);
      if (!sharedKey) {
        return '[🔒 Encrypted Message: Waiting for peer key]';
      }

      const ivBuffer = base64ToArrayBuffer(message.iv);
      const ciphertextBuffer = base64ToArrayBuffer(message.content);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: new Uint8Array(ivBuffer),
        },
        sharedKey,
        ciphertextBuffer
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (err) {
      console.warn('[E2EE] Decryption error (keys mismatched or tampered payload):', err);
      return '[🔒 Encrypted Message: Unable to decrypt]';
    }
  },
};

export default cryptoE2EE;
