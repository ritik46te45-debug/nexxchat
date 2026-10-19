/**
 * Capacitor Native Push Notification & Channel Setup Module
 * 
 * Provides complete support for:
 * - Native Android FCM Push Notifications via @capacitor/push-notifications
 * - Android 8.0+ Notification Channels (Messages, Calls, Groups)
 * - Push registration & token delivery to /api/devices/register
 * - Deep linking on notification tap (navigates straight into conversation)
 * - Safe fallback to Web Push (VAPID) when running in browser
 */

import api from './api';
import { registerPushNotifications as registerWebPush } from './pushNotifications';
import { getOrCreateDeviceId } from './socket';

export const isNativePlatform = () => {
  return typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
};

export const getPlatformName = () => {
  if (typeof window === 'undefined') return 'web';
  if (window.Capacitor?.getPlatform) {
    return window.Capacitor.getPlatform(); // 'android', 'ios', 'web'
  }
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (ua.includes('electron')) return 'windows';
  return 'web';
};

/**
 * Initialize Push Notifications across Native Android (Capacitor) and Browser (Web Push)
 * 
 * @param {object} callbacks
 * @param {function} callbacks.onNavigateToConversation - Function to open conversation on push click
 */
export async function initPushNotifications({ onNavigateToConversation } = {}) {
  if (!isNativePlatform()) {
    // Browser or Electron fallback — use Web Push
    return await registerWebPush();
  }

  try {
    const PushNotifications = window.Capacitor?.Plugins?.PushNotifications;
    if (!PushNotifications) {
      return await registerWebPush();
    }

    // 1. Create Android Notification Channels
    await createNotificationChannels(PushNotifications);

    // 2. Check and request permission
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('[CAPACITOR PUSH] Permission denied by user');
      return false;
    }

    // 3. Listen for FCM token BEFORE calling register (Capacitor requirement)
    PushNotifications.addListener('registration', async (token) => {
      console.log('[CAPACITOR PUSH] FCM Token registered successfully:', token?.value);
      try {
        if (typeof localStorage !== 'undefined' && token?.value) {
          localStorage.setItem('nexchat_fcm_token', token.value);
          localStorage.removeItem('nexchat_fcm_error');
        }
        const deviceId = getOrCreateDeviceId();
        await api.post('/devices/register', {
          deviceId,
          platform: 'android',
          pushToken: token.value,
          pushTransport: 'fcm',
          deviceName: 'Android Device',
        });
        console.log('✅ Android FCM Token registered with server');
      } catch (err) {
        console.warn('[CAPACITOR PUSH] Server registration note:', err.message);
      }
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('[CAPACITOR PUSH] FCM Registration error:', error);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('nexchat_fcm_error', JSON.stringify(error || 'registration_failed'));
      }
    });

    // 4. Register with Apple / Google APNs / FCM
    await PushNotifications.register();

    // 5. Handle foreground push delivery & urgent call banner with Answer/Decline buttons
    const LocalNotifications = window.Capacitor?.Plugins?.LocalNotifications;
    if (LocalNotifications) {
      LocalNotifications.requestPermissions().catch(() => {});
      LocalNotifications.registerActionTypes({
        types: [
          {
            id: 'INCOMING_CALL_ACTIONS',
            actions: [
              {
                id: 'ACCEPT_CALL',
                title: '✅ Answer',
                foreground: true,
              },
              {
                id: 'REJECT_CALL',
                title: '❌ Decline',
                destructive: true,
                foreground: false,
              },
            ],
          },
        ],
      }).catch(() => {});

      LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        console.log('[CAPACITOR LOCAL NOTIF] Action performed:', action);
        const actionId = action.actionId;
        const data = action.notification?.extra || {};
        const conversationId = data.conversationId;
        const type = data.type;
        const callId = data.callId;

        if (type === 'call' && callId) {
          if (actionId === 'REJECT_CALL') {
            // Decline directly from notification bar
            const socket = window.__NEXCHAT_SOCKET;
            if (socket) {
              socket.emit('call:reject', { callId });
            }
            if (typeof window !== 'undefined' && window.NexChatNative?.dismissCallNotification) {
              window.NexChatNative.dismissCallNotification();
            }
            LocalNotifications.cancel({ notifications: [{ id: 9999 }] }).catch(() => {});
            return;
          }

          const callPayload = {
            ...data,
            autoAnswer: actionId === 'ACCEPT_CALL',
          };
          if (typeof window !== 'undefined') {
            window.__PENDING_INCOMING_CALL = callPayload;
            window.dispatchEvent(new CustomEvent('nexchat:incoming_call', { detail: callPayload }));
          }
          if (typeof onIncomingCall === 'function') {
            onIncomingCall(callPayload);
          }
        } else if (conversationId && typeof onNavigateToConversation === 'function') {
          onNavigateToConversation(conversationId);
        }
      });
    }

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[CAPACITOR PUSH] Notification received:', notification);
      const data = notification.data || {};
      if (data.type === 'call' && data.callId && LocalNotifications) {
        LocalNotifications.schedule({
          notifications: [
            {
              id: 9999,
              title: data.callerName || notification.title || 'Incoming Call',
              body: data.callType === 'video' ? '📹 Incoming video call' : '📞 Incoming voice call',
              channelId: 'nexchat_calls_v3',
              actionTypeId: 'INCOMING_CALL_ACTIONS',
              extra: data,
              ongoing: true,
              autoCancel: false,
            },
          ],
        }).catch(() => {});
      }
    });

    // 6. Handle push action / click (Deep Linking & Incoming Call Tap)
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('[CAPACITOR PUSH] Notification clicked:', notification);
      const rawData = notification.notification?.data || {};
      const data = rawData.data || rawData;
      const conversationId = data.conversationId || rawData.conversationId;
      const type = data.type || rawData.type;
      const callId = data.callId || rawData.callId;

      if (type === 'call' && callId) {
        if (typeof window !== 'undefined') {
          window.__PENDING_INCOMING_CALL = data;
          window.dispatchEvent(new CustomEvent('nexchat:incoming_call', { detail: data }));
        }
        if (typeof onIncomingCall === 'function') {
          onIncomingCall(data);
        }
      } else if (conversationId && typeof onNavigateToConversation === 'function') {
        onNavigateToConversation(conversationId);
      }
    });

    return true;

  } catch (error) {
    console.warn('[CAPACITOR PUSH] Setup note (fallback to web push):', error.message);
    return await registerWebPush();
  }
}

/**
 * Clean up legacy notification channels and verify v3 channels
 * High-priority channels with native ringtones are created in MainActivity.java
 */
async function createNotificationChannels(PushNotifications) {
  try {
    if (!PushNotifications.createChannel) return;

    // Clean up older channels that lacked explicit audio or had broken URIs
    if (PushNotifications.deleteChannel) {
      await PushNotifications.deleteChannel({ id: 'nexchat_messages' }).catch(() => {});
      await PushNotifications.deleteChannel({ id: 'nexchat_calls' }).catch(() => {});
      await PushNotifications.deleteChannel({ id: 'nexchat_groups' }).catch(() => {});
      await PushNotifications.deleteChannel({ id: 'nexchat_messages_v2' }).catch(() => {});
      await PushNotifications.deleteChannel({ id: 'nexchat_calls_v2' }).catch(() => {});
      await PushNotifications.deleteChannel({ id: 'nexchat_groups_v2' }).catch(() => {});
    }

    // Ensure fallback v3 channels exist if initialized in hybrid mode
    await PushNotifications.createChannel({
      id: 'nexchat_messages_v3',
      name: 'Messages',
      description: 'Incoming instant messages and chats',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#6366F1',
    });

    await PushNotifications.createChannel({
      id: 'nexchat_calls_v3',
      name: 'Voice & Video Calls',
      description: 'Incoming voice and video call alerts',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#10B981',
    });

    console.log('✅ Android Notification Channels v3 verified');
  } catch (e) {
    console.warn('Channel creation note:', e.message);
  }
}

export default { initPushNotifications, isNativePlatform, getPlatformName };

