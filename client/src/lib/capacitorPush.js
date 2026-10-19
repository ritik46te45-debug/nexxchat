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

    // 5. Handle foreground push delivery
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[CAPACITOR PUSH] Foreground notification received:', notification);
    });

    // 6. Handle push action / click (Deep Linking & Incoming Call Tap)
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('[CAPACITOR PUSH] Notification clicked:', notification);
      const data = notification.notification?.data || {};
      const conversationId = data.conversationId || data.data?.conversationId;
      const type = data.type || data.data?.type;
      const callId = data.callId || data.data?.callId;

      if (type === 'call' && callId && typeof onIncomingCall === 'function') {
        onIncomingCall(data);
      } else if (conversationId && typeof onNavigateToConversation === 'function') {
        onNavigateToConversation(conversationId);
      }
    });

    // 7. Setup Native Local Notifications (for background chimes and status-bar icon)
    const LocalNotifications = window.Capacitor?.Plugins?.LocalNotifications;
    if (LocalNotifications) {
      LocalNotifications.requestPermissions().catch(() => {});
      LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        console.log('[CAPACITOR LOCAL NOTIF] Clicked:', action);
        const data = action.notification?.extra || {};
        const conversationId = data.conversationId;
        const type = data.type;
        const callId = data.callId;

        if (type === 'call' && callId && typeof onIncomingCall === 'function') {
          onIncomingCall(data);
        } else if (conversationId && typeof onNavigateToConversation === 'function') {
          onNavigateToConversation(conversationId);
        }
      });
    }

    return true;
  } catch (error) {
    console.warn('[CAPACITOR PUSH] Setup note (fallback to web push):', error.message);
    return await registerWebPush();
  }
}

/**
 * Setup High-Priority Android Notification Channels
 * IMPORTANT: Do NOT specify sound: 'default' because Android will look for res/raw/default.
 * Omitting sound allows Android to play the phone's native default notification tone!
 */
async function createNotificationChannels(PushNotifications) {
  try {
    if (!PushNotifications.createChannel) return;

    // Remove legacy channels that had broken raw sound references
    if (PushNotifications.deleteChannel) {
      await PushNotifications.deleteChannel({ id: 'nexchat_messages' }).catch(() => {});
      await PushNotifications.deleteChannel({ id: 'nexchat_calls' }).catch(() => {});
      await PushNotifications.deleteChannel({ id: 'nexchat_groups' }).catch(() => {});
    }

    // Messages Channel v2 (High priority, uses system default notification ringtone)
    await PushNotifications.createChannel({
      id: 'nexchat_messages_v2',
      name: 'Messages',
      description: 'Incoming instant messages and chats',
      importance: 5, // High / Heads-up notification
      visibility: 1, // Public on lockscreen
      vibration: true,
      lights: true,
      lightColor: '#6366F1',
    });

    // Calls Channel v2 (Highest priority / Urgent)
    await PushNotifications.createChannel({
      id: 'nexchat_calls_v2',
      name: 'Voice & Video Calls',
      description: 'Incoming voice and video call alerts',
      importance: 5, // Urgent / Full screen heads-up intent
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#10B981',
    });

    // Groups Channel v2
    await PushNotifications.createChannel({
      id: 'nexchat_groups_v2',
      name: 'Group Notifications',
      description: 'Group message alerts and mentions',
      importance: 4,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#8B5CF6',
    });

    // Recreate clean nexchat_messages channel for fallback compatibility
    await PushNotifications.createChannel({
      id: 'nexchat_messages',
      name: 'Messages (Legacy)',
      description: 'Incoming messages',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#6366F1',
    });

    console.log('✅ Android Notification Channels created with native system tones');
  } catch (e) {
    console.warn('Channel creation note:', e.message);
  }
}

export default { initPushNotifications, isNativePlatform, getPlatformName };
