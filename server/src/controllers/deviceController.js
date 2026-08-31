import Device from '../models/Device.js';
import User from '../models/User.js';

// Helper: generate a device ID from request headers if none provided
const generateDeviceIdFromRequest = (req) => {
  const ua = req.headers['user-agent'] || '';
  const ip = req.ip || req.connection?.remoteAddress || '';
  // Create a stable fingerprint from user-agent + a timestamp-based suffix
  // In production, clients should send their own persistent deviceId
  return `web-${Buffer.from(ua).toString('base64').slice(0, 32)}-${ip.replace(/[.:]/g, '')}`;
};

// Helper: detect platform from user-agent
const detectPlatform = (userAgent = '') => {
  const ua = userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
  if (ua.includes('electron')) return 'windows'; // Electron on Windows
  if (ua.includes('windows')) return 'web'; // Browser on Windows (web platform)
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'web';
};

// Helper: generate a human-readable device name from user-agent
const generateDeviceName = (userAgent = '') => {
  const ua = userAgent;
  // Try to extract browser name
  let browser = 'Unknown Browser';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';

  // Try to extract OS
  let os = 'Unknown OS';
  if (ua.includes('Windows NT 10')) os = 'Windows 10/11';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone')) os = 'iPhone';
  else if (ua.includes('iPad')) os = 'iPad';
  else if (ua.includes('Linux')) os = 'Linux';

  return `${browser} on ${os}`;
};

/**
 * POST /api/devices/register
 * Register or update a device for push notifications.
 * Body: { deviceId?, platform?, pushToken?, pushSubscription?, pushTransport?, deviceName?, appVersion? }
 */
export const registerDevice = async (req, res) => {
  try {
    const userId = req.userId;
    const userAgent = req.headers['user-agent'] || '';
    const {
      deviceId = generateDeviceIdFromRequest(req),
      platform = detectPlatform(userAgent),
      pushToken = null,
      pushSubscription = null,
      pushTransport = 'none',
      deviceName = generateDeviceName(userAgent),
      appVersion = '',
    } = req.body;

    // Determine push transport from what's provided
    let transport = pushTransport;
    if (transport === 'none') {
      if (pushToken) transport = 'fcm';
      else if (pushSubscription?.endpoint) transport = 'vapid';
    }

    const update = {
      user: userId,
      platform,
      pushTransport: transport,
      deviceName,
      appVersion,
      lastActiveAt: new Date(),
      status: 'active',
      pushFailureCount: 0,
      lastPushFailure: null,
    };

    if (pushToken) {
      update.pushToken = pushToken;
    }

    if (pushSubscription?.endpoint) {
      update.pushSubscription = {
        endpoint: pushSubscription.endpoint,
        keys: {
          p256dh: pushSubscription.keys?.p256dh || null,
          auth: pushSubscription.keys?.auth || null,
        },
      };
    }

    const device = await Device.findOneAndUpdate(
      { user: userId, deviceId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Also migrate: if user still has pushSubscriptions with matching endpoint, 
    // that's fine — we'll keep both during transition
    
    res.status(200).json({
      message: 'Device registered successfully',
      device: {
        id: device._id,
        deviceId: device.deviceId,
        platform: device.platform,
        pushTransport: device.pushTransport,
        deviceName: device.deviceName,
        status: device.status,
      },
    });
  } catch (error) {
    console.error('Register device error:', error);
    // Handle duplicate key error gracefully
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Device already registered' });
    }
    res.status(500).json({ error: 'Failed to register device' });
  }
};

/**
 * PUT /api/devices/token
 * Update push token for an existing device (e.g., FCM token rotation).
 * Body: { deviceId, pushToken, pushTransport? }
 */
export const updatePushToken = async (req, res) => {
  try {
    const userId = req.userId;
    const { deviceId, pushToken, pushTransport } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    const update = {
      pushToken: pushToken || null,
      lastActiveAt: new Date(),
      status: 'active',
      pushFailureCount: 0,
      lastPushFailure: null,
    };

    if (pushTransport) {
      update.pushTransport = pushTransport;
    }

    const device = await Device.findOneAndUpdate(
      { user: userId, deviceId },
      { $set: update },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ message: 'Push token updated', deviceId: device.deviceId });
  } catch (error) {
    console.error('Update push token error:', error);
    res.status(500).json({ error: 'Failed to update push token' });
  }
};

/**
 * PUT /api/devices/:deviceId/revoke
 * Revoke a device (e.g., on logout). Clears push token, sets status to revoked.
 */
export const revokeDevice = async (req, res) => {
  try {
    const userId = req.userId;
    const { deviceId } = req.params;

    const device = await Device.findOneAndUpdate(
      { user: userId, deviceId },
      {
        $set: {
          status: 'revoked',
          pushToken: null,
          pushSubscription: { endpoint: null, keys: { p256dh: null, auth: null } },
          isSocketConnected: false,
        },
      },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ message: 'Device revoked successfully' });
  } catch (error) {
    console.error('Revoke device error:', error);
    res.status(500).json({ error: 'Failed to revoke device' });
  }
};

/**
 * GET /api/devices
 * List all devices for the authenticated user.
 */
export const listDevices = async (req, res) => {
  try {
    const devices = await Device.find({ user: req.userId })
      .select('deviceId platform deviceName pushTransport status lastActiveAt isSocketConnected appVersion createdAt')
      .sort({ lastActiveAt: -1 });

    res.json({ devices });
  } catch (error) {
    console.error('List devices error:', error);
    res.status(500).json({ error: 'Failed to list devices' });
  }
};

/**
 * DELETE /api/devices/:deviceId
 * Permanently delete a device registration.
 */
export const deleteDevice = async (req, res) => {
  try {
    const userId = req.userId;
    const { deviceId } = req.params;

    const result = await Device.findOneAndDelete({ user: userId, deviceId });

    if (!result) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ message: 'Device deleted successfully' });
  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({ error: 'Failed to delete device' });
  }
};

/**
 * POST /api/devices/heartbeat
 * Update lastActiveAt for a device (called periodically by clients).
 * Body: { deviceId }
 */
export const deviceHeartbeat = async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    await Device.findOneAndUpdate(
      { user: req.userId, deviceId },
      { $set: { lastActiveAt: new Date() } }
    );

    res.json({ message: 'Heartbeat received' });
  } catch (error) {
    console.error('Device heartbeat error:', error);
    res.status(500).json({ error: 'Failed to update heartbeat' });
  }
};
