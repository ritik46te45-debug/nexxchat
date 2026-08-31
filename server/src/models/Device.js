import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // Platform identifier
  platform: {
    type: String,
    enum: ['android', 'ios', 'windows', 'macos', 'web', 'linux'],
    required: true,
  },
  // Push token (FCM token for Android, or null for web/desktop)
  pushToken: {
    type: String,
    default: null,
  },
  // For Web Push (VAPID), store the full subscription object
  pushSubscription: {
    endpoint: { type: String, default: null },
    keys: {
      p256dh: { type: String, default: null },
      auth: { type: String, default: null },
    },
  },
  // Push transport type
  pushTransport: {
    type: String,
    enum: ['fcm', 'vapid', 'apns', 'none'],
    default: 'none',
  },
  // Human-readable device name (e.g., "Pixel 7a", "Chrome on Windows")
  deviceName: {
    type: String,
    default: 'Unknown Device',
  },
  // Unique device fingerprint (prevents duplicate registrations)
  deviceId: {
    type: String,
    required: true,
  },
  // App version for compatibility tracking
  appVersion: {
    type: String,
    default: '',
  },
  // Last time this device was active (used for stale device pruning)
  lastActiveAt: {
    type: Date,
    default: Date.now,
  },
  // Whether the device has an active foreground socket right now
  // (updated by ConnectionManager on connect/disconnect)
  isSocketConnected: {
    type: Boolean,
    default: false,
  },
  // Token status lifecycle: active → stale → expired → (deleted)
  //                         active → revoked → (deleted)
  status: {
    type: String,
    enum: ['active', 'stale', 'revoked', 'expired'],
    default: 'active',
  },
  // Track consecutive push delivery failures for auto-pruning
  pushFailureCount: {
    type: Number,
    default: 0,
  },
  lastPushFailure: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// Compound unique: one device ID per user
deviceSchema.index({ user: 1, deviceId: 1 }, { unique: true });
// Fast lookup by push token (for FCM token rotation)
deviceSchema.index({ pushToken: 1 }, { sparse: true });
// Find all active devices for a user quickly
deviceSchema.index({ user: 1, status: 1 });
// Prune stale devices by last active time
deviceSchema.index({ lastActiveAt: 1 });
// Find devices by VAPID endpoint (for deduplication)
deviceSchema.index({ 'pushSubscription.endpoint': 1 }, { sparse: true });

const Device = mongoose.model('Device', deviceSchema);
export default Device;
