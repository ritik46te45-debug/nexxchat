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

    // 3. Register with Apple / Google APNs / FCM
    await PushNotifications.register();

    // 4. Listen for FCM token
    PushNotifications.addListener('registration', async (token) => {
      console.log('[CAPACITOR PUSH] FCM Token registered:', token.value);
      try {
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
      console.error('[CAPACITOR PUSH] Registration error:', error);
    });

    // 5. Handle foreground push delivery
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[CAPACITOR PUSH] Foreground notification received:', notification);
    });

    // 6. Handle push action / click (Deep Linking)
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('[CAPACITOR PUSH] Notification clicked:', notification);
      const data = notification.notification?.data || {};
      const conversationId = data.conversationId || data.data?.conversationId;

      if (conversationId && typeof onNavigateToConversation === 'function') {
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
 * Setup High-Priority Android Notification Channels
 */
async function createNotificationChannels(PushNotifications) {
  try {
    if (!PushNotifications.createChannel) return;

    // Messages Channel
    await PushNotifications.createChannel({
      id: 'nexchat_messages',
      name: 'Messages',
      description: 'Incoming instant messages and chats',
      importance: 5, // High / Heads-up notification
      visibility: 1, // Public on lockscreen
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#6366F1',
    });

    // Calls Channel (Highest priority)
    await PushNotifications.createChannel({
      id: 'nexchat_calls',
      name: 'Voice & Video Calls',
      description: 'Incoming voice and video call alerts',
      importance: 5, // Urgent / Full screen intent
      visibility: 1,
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#10B981',
    });

    // Groups Channel
    await PushNotifications.createChannel({
      id: 'nexchat_groups',
      name: 'Group Notifications',
      description: 'Group message alerts and mentions',
      importance: 4,
      visibility: 1,
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#8B5CF6',
    });

    console.log('✅ Android Notification Channels created');
  } catch (e) {
    console.warn('Channel creation note:', e.message);
  }
}

export default { initPushNotifications, isNativePlatform, getPlatformName };
