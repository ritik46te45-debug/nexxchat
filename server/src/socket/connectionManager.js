// Centralized Socket Connection Manager
// Thread-safe / module-singleton registry for all connected user sockets

class ConnectionManager {
  constructor() {
    // Map<userId (string), Set<socketId (string)>>
    this.userSockets = new Map();
    // Map<socketId (string), deviceId (string)> — track which device each socket belongs to
    this.socketDeviceMap = new Map();
  }

  // Register a socket connection for a user
  // Optionally accepts deviceId to update Device model
  registerSocket(userId, socketId, deviceId = null) {
    if (!userId || !socketId) return;
    const uid = userId.toString();
    const sid = socketId.toString();

    if (!this.userSockets.has(uid)) {
      this.userSockets.set(uid, new Set());
    }
    this.userSockets.get(uid).add(sid);

    // Track socket → device mapping
    if (deviceId) {
      this.socketDeviceMap.set(sid, deviceId);
    }

    console.log(`[RT-CONN] REGISTER -> User: ${uid} | Socket: ${sid} | Active sockets for user: ${this.userSockets.get(uid).size}`);

    // Update Device.isSocketConnected in background (non-blocking)
    this._updateDeviceSocketStatus(uid, deviceId || sid, true);
  }

  // Remove a socket connection on disconnect
  removeSocket(userId, socketId) {
    if (!userId || !socketId) return;
    const uid = userId.toString();
    const sid = socketId.toString();

    // Get the deviceId for this socket before removing
    const deviceId = this.socketDeviceMap.get(sid) || sid;
    this.socketDeviceMap.delete(sid);

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

    // Check if user still has any sockets connected
    const stillOnline = this.isUserOnline(uid);

    // Update Device.isSocketConnected in background
    // Only mark disconnected if user has no more sockets
    if (!stillOnline) {
      this._updateDeviceSocketStatus(uid, deviceId, false);
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

  // Update Device.isSocketConnected in MongoDB (non-blocking, fire-and-forget)
  async _updateDeviceSocketStatus(userId, deviceId, isConnected) {
    try {
      // Dynamic import to avoid circular dependency
      const { default: Device } = await import('../models/Device.js');
      
      if (deviceId && deviceId !== userId) {
        // Update specific device by deviceId
        await Device.findOneAndUpdate(
          { user: userId, deviceId },
          { 
            $set: { 
              isSocketConnected: isConnected,
              lastActiveAt: new Date(),
            } 
          }
        );
      } else {
        // No specific deviceId — update all devices for this user
        await Device.updateMany(
          { user: userId, status: 'active' },
          { 
            $set: { 
              isSocketConnected: isConnected,
              lastActiveAt: new Date(),
            } 
          }
        );
      }
    } catch (e) {
      // Non-critical — don't crash on Device update failure
      // This will happen if no Device documents exist yet (pre-migration)
    }
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

