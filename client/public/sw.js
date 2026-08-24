// NexChat Production Service Worker — Web Push Notifications & Offline Support
const CACHE_NAME = 'nexchat-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming background Web Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || 'NexChat';
    const options = {
      body: payload.body || 'You have a new message',
      icon: payload.icon || '/favicon.ico',
      badge: payload.badge || '/favicon.ico',
      data: payload.data || {},
      tag: payload.data?.conversationId || 'nexchat-msg',
      renotify: true,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open', title: 'Reply' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    const title = 'NexChat Notification';
    const options = {
      body: event.data.text() || 'New activity in NexChat',
      icon: '/favicon.ico',
      vibrate: [150, 80, 150]
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

// Handle notification click: focus existing window or open conversation
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const conversationId = event.notification.data?.conversationId;
  const targetUrl = conversationId ? `/?conversation=${conversationId}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'NAVIGATE_CONVERSATION',
            conversationId: conversationId
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
