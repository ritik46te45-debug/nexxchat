import api from './api';
import { getOrCreateDeviceId } from './socket';

// Convert URL-safe base64 string to Uint8Array for VAPID applicationServerKey
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Compare two Uint8Arrays
function areKeysEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Register Service Worker and subscribe user to Web Push
export async function registerPushNotifications() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[PUSH] Web Push Notifications are not supported by this browser environment');
    return false;
  }

  try {
    // 1. Register and update Service Worker
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    try {
      await registration.update();
    } catch (e) {}
    await navigator.serviceWorker.ready;

    // 2. Request Notification Permission
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      console.log('[PUSH] Push notification permission not granted:', permission);
      return false;
    }

    // 3. Fetch current VAPID public key from backend
    const { data } = await api.get('/notifications/vapid-key');
    if (!data?.publicKey) {
      console.warn('[PUSH] No VAPID public key received from server');
      return false;
    }

    const applicationServerKey = urlBase64ToUint8Array(data.publicKey);

    // 4. Inspect existing subscription and refresh if key changed
    let subscription = await registration.pushManager.getSubscription();
    let needsNewSubscription = !subscription;

    if (subscription) {
      try {
        const existingKey = subscription.options?.applicationServerKey;
        if (existingKey) {
          const existingArray = new Uint8Array(existingKey);
          if (!areKeysEqual(existingArray, applicationServerKey)) {
            console.log('[PUSH] VAPID key refreshed on server — updating subscription...');
            await subscription.unsubscribe();
            needsNewSubscription = true;
          }
        }
      } catch (keyErr) {
        console.warn('[PUSH] Key check error, recreating subscription:', keyErr.message);
        try { await subscription.unsubscribe(); } catch (e) {}
        needsNewSubscription = true;
      }
    }

    if (needsNewSubscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    const subJson = subscription.toJSON();

    // 5. Send subscription to backend notifications route
    await api.post('/notifications/subscribe', {
      subscription: subJson,
    });

    // 6. Also register in Device registry
    try {
      const deviceId = getOrCreateDeviceId();
      await api.post('/devices/register', {
        deviceId,
        platform: 'web',
        pushTransport: 'vapid',
        pushSubscription: {
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys?.p256dh,
            auth: subJson.keys?.auth,
          },
        },
        deviceName: navigator.userAgent.includes('Mobile') ? 'Mobile Web Browser' : 'Desktop Web Browser',
      });
    } catch (devErr) {
      // Non-critical device record update
    }

    console.log('✅ Background Web Push Notifications registered & active on this device');
    return true;
  } catch (error) {
    console.warn('[PUSH] Push registration note:', error.message);
    return false;
  }
}
