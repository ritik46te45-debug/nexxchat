import api from './api';

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

// Register Service Worker and subscribe user to Web Push
export async function registerPushNotifications() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Web Push Notifications are not supported by this browser');
    return false;
  }

  try {
    // 1. Register Service Worker
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    // 2. Check permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Push notification permission denied by user');
      return false;
    }

    // 3. Fetch VAPID public key from backend
    const { data } = await api.get('/notifications/vapid-key');
    if (!data?.publicKey) {
      console.warn('No VAPID public key received from server');
      return false;
    }

    const applicationServerKey = urlBase64ToUint8Array(data.publicKey);

    // 4. Subscribe with PushManager
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    // 5. Send subscription object to backend
    await api.post('/notifications/subscribe', {
      subscription: subscription.toJSON(),
    });

    console.log('✅ Background Web Push Notifications registered & active');
    return true;
  } catch (error) {
    console.warn('Push registration note:', error.message);
    return false;
  }
}
