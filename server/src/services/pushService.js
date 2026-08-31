/**
 * Centralized Push Notification Dispatch Service
 * 
 * Handles sending push notifications across all supported transports:
 * - VAPID (Web Push for browsers)
 * - FCM (Firebase Cloud Messaging for Android)
 * - Future: APNS (Apple Push Notification Service for iOS)
 * 
 * Includes per-device filtering based on user notification settings,
 * conversation mute status, DnD schedule, and foreground socket status.
 */

import Device from '../models/Device.js';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import { sendPushNotification as sendVapidPush } from '../config/webPush.js';

// ============================================================
// Firebase Cloud Messaging (FCM) Driver for Android & iOS
// ============================================================
let firebaseAdmin = null;
let firebaseInitialized = false;

const getFirebaseMessaging = async () => {
  if (firebaseInitialized) return firebaseAdmin ? firebaseAdmin.messaging() : null;

  try {
    const admin = await import('firebase-admin');
    
    // Check environment for service account credentials
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      firebaseAdmin = admin.default.initializeApp({
        credential: admin.default.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      console.log('✅ Firebase Admin SDK initialized from FIREBASE_SERVICE_ACCOUNT_KEY');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firebaseAdmin = admin.default.initializeApp({
        credential: admin.default.credential.applicationDefault(),
      });
      firebaseInitialized = true;
      console.log('✅ Firebase Admin SDK initialized from GOOGLE_APPLICATION_CREDENTIALS');
    } else {
      firebaseInitialized = true; // Tried, but no credentials configured
    }
  } catch (e) {
    firebaseInitialized = true;
    console.warn('[PUSH] Firebase Admin SDK not initialized (credentials not provided yet):', e.message);
  }

  return firebaseAdmin ? firebaseAdmin.messaging() : null;
};

const sendFcmPush = async (fcmToken, payload) => {
  if (!fcmToken) return null;

  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) {
      console.log(`[PUSH] FCM skipped (Firebase credentials pending) — token: ${fcmToken.slice(0, 15)}...`);
      return null;
    }

    const channelId = payload.data?.type === 'call'
      ? 'nexchat_calls'
      : (payload.data?.type === 'group_message' ? 'nexchat_groups' : 'nexchat_messages');

    const fcmMessage = {
      token: fcmToken,
      notification: {
        title: payload.title || 'NexChat',
        body: payload.body || 'New message',
      },
      android: {
        priority: 'high',
        notification: {
          channelId,
          sound: 'default',
          color: '#6366f1',
          clickAction: 'OPEN_ACTIVITY',
          tag: payload.tag || 'nexchat-msg',
        },
      },
      data: {
        conversationId: String(payload.data?.conversationId || ''),
        messageId: String(payload.data?.messageId || ''),
        type: String(payload.data?.type || ''),
        callId: String(payload.data?.callId || ''),
      },
    };

    const response = await messaging.send(fcmMessage);
    return { success: true, messageId: response };
  } catch (error) {
    console.warn('[PUSH] FCM send error:', error.message);
    if (
      error.code === 'messaging/registration-token-not-registered' ||
      error.code === 'messaging/invalid-registration-token'
    ) {
      return { expired: true, token: fcmToken };
    }
    return null;
  }
};

// ============================================================
// DnD Schedule Check
// ============================================================
const isInDndWindow = (settings) => {
  if (!settings) return false;

  // Simple DnD toggle (no schedule)
  if (settings.doNotDisturb && !settings.dndSchedule?.enabled) {
    return true;
  }

  // Scheduled DnD
  if (settings.dndSchedule?.enabled) {
    const { startTime, endTime, timezone } = settings.dndSchedule;
    if (!startTime || !endTime) return false;

    try {
      const now = new Date();
      // Get current time in user's timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone || 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const currentHour = parseInt(parts.find(p => p.type === 'hour').value);
      const currentMinute = parseInt(parts.find(p => p.type === 'minute').value);
      const currentMinutes = currentHour * 60 + currentMinute;

      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      // Handle overnight DnD (e.g., 22:00 → 07:00)
      if (startMinutes > endMinutes) {
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
      }
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } catch (e) {
      console.warn('[PUSH] DnD time check error:', e.message);
      return false;
    }
  }

  return false;
};

// ============================================================
// Build Notification Payload
// ============================================================
const buildPayload = (event, data, settings) => {
  const showPreview = settings?.showPreview !== false;
  const showSender = settings?.showSender !== false;

  let title = 'NexChat';
  let body = 'New notification';
  let icon = '/favicon.ico';
  let badge = '/favicon.ico';
  let tag = 'nexchat-notification';
  let notifData = {};

  switch (event) {
    case 'message': {
      const senderName = data.senderName || 'Someone';
      title = showSender ? senderName : 'New Message';
      if (showPreview && data.content) {
        body = data.content.length > 100 ? data.content.slice(0, 100) + '…' : data.content;
      } else if (showPreview && data.type && data.type !== 'text') {
        const typeLabels = {
          image: '📷 Photo',
          video: '🎥 Video',
          audio: '🎵 Audio',
          voice: '🎤 Voice message',
          document: '📄 Document',
          file: '📎 File',
          gif: 'GIF',
          sticker: '🏷️ Sticker',
          location: '📍 Location',
          contact: '👤 Contact',
          poll: '📊 Poll',
        };
        body = typeLabels[data.type] || 'New message';
      } else {
        body = 'New message';
      }
      icon = data.senderAvatar || icon;
      tag = `msg-${data.conversationId || 'unknown'}`;
      notifData = {
        type: 'message',
        conversationId: data.conversationId,
        messageId: data.messageId,
        senderId: data.senderId,
      };
      break;
    }

    case 'call': {
      const callerName = data.callerName || 'Someone';
      title = showSender ? callerName : 'Incoming Call';
      body = data.callType === 'video' ? '📹 Incoming video call' : '📞 Incoming voice call';
      icon = data.callerAvatar || icon;
      tag = `call-${data.callId || 'unknown'}`;
      notifData = {
        type: 'call',
        callId: data.callId,
        conversationId: data.conversationId,
        callType: data.callType,
      };
      break;
    }

    case 'friend_request': {
      const fromName = data.fromName || 'Someone';
      title = showSender ? fromName : 'Friend Request';
      body = showSender ? `${fromName} sent you a friend request` : 'You have a new friend request';
      icon = data.fromAvatar || icon;
      tag = `friend-${data.friendRequestId || 'unknown'}`;
      notifData = {
        type: 'friend_request',
        friendRequestId: data.friendRequestId,
      };
      break;
    }

    case 'friend_accepted': {
      const friendName = data.friendName || 'Someone';
      title = showSender ? friendName : 'Friend Request Accepted';
      body = showSender ? `${friendName} accepted your friend request` : 'Your friend request was accepted';
      icon = data.friendAvatar || icon;
      tag = `friend-accepted-${data.userId || 'unknown'}`;
      notifData = { type: 'friend_accepted' };
      break;
    }

    case 'mention': {
      const mentioner = data.senderName || 'Someone';
      title = showSender ? mentioner : 'Mention';
      body = showPreview ? `Mentioned you: ${(data.content || '').slice(0, 80)}` : 'You were mentioned';
      tag = `mention-${data.conversationId || 'unknown'}`;
      notifData = {
        type: 'mention',
        conversationId: data.conversationId,
        messageId: data.messageId,
      };
      break;
    }

    default:
      title = data.title || 'NexChat';
      body = data.body || 'New notification';
      notifData = data.data || {};
  }

  return { title, body, icon, badge, tag, data: notifData };
};

// ============================================================
// Main Push Dispatch
// ============================================================

/**
 * Send a push notification to a user across all their registered devices.
 * 
 * @param {string} recipientUserId - The user to notify
 * @param {string} event - Event type: 'message', 'call', 'friend_request', 'mention', etc.
 * @param {object} data - Event-specific data (senderName, content, conversationId, etc.)
 * @param {object} options - Optional overrides
 * @param {string} options.conversationId - If provided, checks mute status
 * @param {boolean} options.skipForegroundDevices - If true, skip devices with active sockets (default: true for messages)
 */
export const dispatchPush = async (recipientUserId, event, data, options = {}) => {
  try {
    const userId = recipientUserId.toString();

    // 1. Fetch user settings
    const user = await User.findById(userId).select('notificationSettings');
    if (!user) {
      console.warn(`[PUSH] User ${userId} not found, skipping push`);
      return { sent: 0, skipped: 0, errors: 0 };
    }

    const settings = user.notificationSettings || {};

    // 2. Master kill switch
    if (settings.allNotifications === false) {
      return { sent: 0, skipped: 'master_off', errors: 0 };
    }

    // 3. DnD check (calls bypass DnD)
    if (event !== 'call' && isInDndWindow(settings)) {
      return { sent: 0, skipped: 'dnd', errors: 0 };
    }

    // 4. Per-category toggle check
    const categoryMap = {
      message: 'messages',
      call: 'calls',
      friend_request: 'friendRequests',
      friend_accepted: 'friendRequests',
      mention: 'mentions',
      group_message: 'groups',
      status_reaction: 'statusUpdates',
      status_reply: 'statusUpdates',
    };
    const category = categoryMap[event];
    if (category && settings[category] === false) {
      return { sent: 0, skipped: 'category_off', errors: 0 };
    }

    // 5. Per-conversation mute check
    const conversationId = options.conversationId || data.conversationId;
    if (conversationId && (event === 'message' || event === 'group_message')) {
      const conversation = await Conversation.findById(conversationId);
      if (conversation) {
        const participant = conversation.getParticipant(userId);
        if (participant?.isMuted) {
          const isMuteActive = !participant.mutedUntil || participant.mutedUntil > new Date();
          if (isMuteActive) {
            return { sent: 0, skipped: 'muted', errors: 0 };
          }
        }
      }
    }

    // 6. Get all active devices for this user
    let devices = await Device.find({ user: userId, status: 'active' });
    
    // Build payload
    const payload = buildPayload(event, data, settings);

    // Fallback if no Device records exist yet (legacy migration)
    if (devices.length === 0) {
      const fullUser = await User.findById(userId).select('pushSubscriptions');
      if (fullUser?.pushSubscriptions?.length > 0) {
        await sendLegacyPush(userId, payload);
        return { sent: fullUser.pushSubscriptions.length, skipped: 0, errors: 0 };
      }
      return { sent: 0, skipped: 'no_devices', errors: 0 };
    }

    // 8. Send to each device
    const skipForeground = options.skipForegroundDevices !== false && event !== 'call';
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    const sendPromises = devices.map(async (device) => {
      try {
        // Skip foreground-connected devices for non-call events
        if (skipForeground && device.isSocketConnected) {
          skipped++;
          return;
        }

        if (device.pushTransport === 'vapid' && device.pushSubscription?.endpoint) {
          const subscription = {
            endpoint: device.pushSubscription.endpoint,
            keys: {
              p256dh: device.pushSubscription.keys.p256dh,
              auth: device.pushSubscription.keys.auth,
            },
          };

          const result = await sendVapidPush(subscription, payload);

          if (result?.expired) {
            // Subscription expired — mark device
            await Device.findByIdAndUpdate(device._id, {
              $set: { status: 'expired', pushSubscription: { endpoint: null, keys: { p256dh: null, auth: null } } },
            });
            errors++;
          } else {
            sent++;
            // Reset failure count on success
            if (device.pushFailureCount > 0) {
              await Device.findByIdAndUpdate(device._id, {
                $set: { pushFailureCount: 0, lastPushFailure: null },
              });
            }
          }
        } else if (device.pushTransport === 'fcm' && device.pushToken) {
          const result = await sendFcmPush(device.pushToken, payload);
          if (result === null) {
            // FCM not configured yet — don't count as error
            skipped++;
          } else if (result?.expired) {
            await Device.findByIdAndUpdate(device._id, {
              $set: { status: 'expired', pushToken: null },
            });
            errors++;
          } else {
            sent++;
            if (device.pushFailureCount > 0) {
              await Device.findByIdAndUpdate(device._id, {
                $set: { pushFailureCount: 0, lastPushFailure: null },
              });
            }
          }
        } else {
          // No push transport configured for this device
          skipped++;
        }
      } catch (err) {
        console.error(`[PUSH] Error sending to device ${device.deviceId}:`, err.message);

        // Increment failure count
        const newFailureCount = (device.pushFailureCount || 0) + 1;
        const updateFields = {
          pushFailureCount: newFailureCount,
          lastPushFailure: new Date(),
        };

        // Auto-expire after 3 consecutive failures
        if (newFailureCount >= 3) {
          updateFields.status = 'expired';
          updateFields.pushToken = null;
        }

        await Device.findByIdAndUpdate(device._id, { $set: updateFields });
        errors++;
      }
    });

    await Promise.allSettled(sendPromises);

    return { sent, skipped, errors };
  } catch (error) {
    console.error('[PUSH] dispatchPush error:', error);
    return { sent: 0, skipped: 0, errors: 1 };
  }
};

/**
 * Legacy compatibility: send push to a user using their old pushSubscriptions array.
 * This will be removed once migration to Device model is complete.
 */
export const sendLegacyPush = async (userId, payload) => {
  try {
    const user = await User.findById(userId).select('pushSubscriptions');
    if (!user?.pushSubscriptions?.length) return;

    const promises = user.pushSubscriptions.map(async (sub) => {
      try {
        const result = await sendVapidPush(sub, payload);
        if (result?.expired) {
          // Remove expired subscription
          await User.findByIdAndUpdate(userId, {
            $pull: { pushSubscriptions: { endpoint: sub.endpoint } },
          });
        }
      } catch (e) {
        console.warn('[PUSH] Legacy push error:', e.message);
      }
    });

    await Promise.allSettled(promises);
  } catch (error) {
    console.error('[PUSH] sendLegacyPush error:', error);
  }
};

export default { dispatchPush, sendLegacyPush };
