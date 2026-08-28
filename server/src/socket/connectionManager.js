// Centralized Socket Connection Manager
// Thread-safe / module-singleton registry for all connected user sockets

class ConnectionManager {
  constructor() {
    // Map<userId (string), Set<socketId (string)>>
    this.userSockets = new Map();
  }

  // Register a socket connection for a user
  registerSocket(userId, socketId) {
    if (!userId || !socketId) return;
    const uid = userId.toString();
    const sid = socketId.toString();

    if (!this.userSockets.has(uid)) {
      this.userSockets.set(uid, new Set());
    }
    this.userSockets.get(uid).add(sid);
    console.log(`[RT-CONN] REGISTER -> User: ${uid} | Socket: ${sid} | Active sockets for user: ${this.userSockets.get(uid).size}`);
  }

  // Remove a socket connection on disconnect
  removeSocket(userId, socketId) {
    if (!userId || !socketId) return;
    const uid = userId.toString();
    const sid = socketId.toString();

    const sockets = this.userSockets.get(uid);
    if (sockets) {
      sockets.delete(sid);
      if (sockets.size === 0) {
        this.userSockets.delete(uid);
        console.log(`[RT-CONN] UNREGISTER -> User: ${uid} is now offline (0 sockets remaining)`);
      } else {
        console.log(`[RT-CONN] UNREGISTER -> User: ${uid} | Socket: ${sid} removed | Remaining: ${sockets.size}`);
      }
    }
  }

  // Get all active socket IDs for a given user ID
  getUserSockets(userId) {
    if (!userId) return [];
    const uid = userId.toString();
    const sockets = this.userSockets.get(uid);
    return sockets ? Array.from(sockets) : [];
  }

  // Check if a user has at least one active socket
  isUserOnline(userId) {
    if (!userId) return false;
    const uid = userId.toString();
    const sockets = this.userSockets.get(uid);
    return Boolean(sockets && sockets.size > 0);
  }

  // Get all currently online user IDs
  getOnlineUserIds() {
    return Array.from(this.userSockets.keys());
  }

  // Debug helper
  dumpState() {
    const dump = {};
    for (const [uid, sids] of this.userSockets.entries()) {
      dump[uid] = Array.from(sids);
    }
    return dump;
  }
}

// Single authoritative singleton instance
export const connectionManager = new ConnectionManager();
export default connectionManager;
