/**
 * IndexedDB Offline-First Caching Layer
 * Provides instant 0.0s startup, offline chat browsing, and persistent E2EE cryptographic keys.
 * Powered by idb-keyval with custom object stores.
 */
import { get, set, del, clear, createStore } from 'idb-keyval';

// Custom stores
const chatStore = createStore('nexchat-db', 'chats');
const messagesStore = createStore('nexchat-db', 'messages');
const cryptoStore = createStore('nexchat-db', 'crypto-keys');

const CONVERSATIONS_KEY = 'cached_conversations';
const DRAFTS_KEY = 'cached_drafts';

export const idb = {
  // ====== CONVERSATIONS ======
  async getConversations() {
    try {
      return (await get(CONVERSATIONS_KEY, chatStore)) || [];
    } catch (e) {
      console.warn('[IDB] Failed to load conversations from IndexedDB:', e);
      return [];
    }
  },

  async setConversations(conversations) {
    try {
      if (!Array.isArray(conversations)) return;
      await set(CONVERSATIONS_KEY, conversations, chatStore);
    } catch (e) {
      console.warn('[IDB] Failed to persist conversations to IndexedDB:', e);
    }
  },

  // ====== MESSAGES ======
  async getMessages(conversationId) {
    if (!conversationId) return [];
    try {
      return (await get(conversationId.toString(), messagesStore)) || [];
    } catch (e) {
      console.warn(`[IDB] Failed to load messages for ${conversationId}:`, e);
      return [];
    }
  },

  async setMessages(conversationId, messages) {
    if (!conversationId || !Array.isArray(messages)) return;
    try {
      // Keep up to latest 500 messages per conversation in disk cache
      const slice = messages.length > 500 ? messages.slice(messages.length - 500) : messages;
      await set(conversationId.toString(), slice, messagesStore);
    } catch (e) {
      console.warn(`[IDB] Failed to cache messages for ${conversationId}:`, e);
    }
  },

  async appendMessage(conversationId, message) {
    if (!conversationId || !message) return;
    try {
      const existing = (await get(conversationId.toString(), messagesStore)) || [];
      const exists = existing.some((m) => m._id === message._id || (m.clientId && m.clientId === message.clientId));
      if (!exists) {
        const updated = [...existing, message];
        await set(conversationId.toString(), updated.length > 500 ? updated.slice(updated.length - 500) : updated, messagesStore);
      }
    } catch (e) {
      console.warn(`[IDB] Failed to append message to cache:`, e);
    }
  },

  // ====== DRAFTS ======
  async getDrafts() {
    try {
      return (await get(DRAFTS_KEY, chatStore)) || {};
    } catch {
      return {};
    }
  },

  async setDrafts(drafts) {
    try {
      await set(DRAFTS_KEY, drafts || {}, chatStore);
    } catch (e) {
      console.warn('[IDB] Failed to save drafts:', e);
    }
  },

  // ====== E2EE HARDWARE CRYPTO KEYS ======
  async getMyKeyPair() {
    try {
      return await get('my_ecdh_keypair', cryptoStore);
    } catch (e) {
      console.warn('[IDB] Failed to retrieve ECDH keypair:', e);
      return null;
    }
  },

  async setMyKeyPair(keypair) {
    try {
      await set('my_ecdh_keypair', keypair, cryptoStore);
    } catch (e) {
      console.warn('[IDB] Failed to store ECDH keypair:', e);
    }
  },

  async getSharedSecret(conversationId) {
    if (!conversationId) return null;
    try {
      return await get(`secret_${conversationId}`, cryptoStore);
    } catch {
      return null;
    }
  },

  async setSharedSecret(conversationId, secretData) {
    if (!conversationId || !secretData) return;
    try {
      await set(`secret_${conversationId}`, secretData, cryptoStore);
    } catch (e) {
      console.warn(`[IDB] Failed to store shared secret for ${conversationId}:`, e);
    }
  },

  // ====== SYSTEM WIPE ======
  async clearAll() {
    try {
      await clear(chatStore);
      await clear(messagesStore);
      await clear(cryptoStore);
    } catch (e) {
      console.warn('[IDB] Failed to clear DB:', e);
    }
  }
};

export default idb;
