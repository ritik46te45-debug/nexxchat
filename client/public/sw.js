// NexChat Production Service Worker — Web Push Notifications & Background Alerts
const CACHE_NAME = 'nexchat-v2';

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
    const isCall = payload.data?.type === 'call';
    const title = payload.title || (isCall ? '📞 Incoming Call' : 'NexChat');

    const options = {
      body: payload.body || (isCall ? 'Someone is calling you...' : 'You have a new message'),
      icon: payload.icon || '/favicon.ico',
      badge: payload.badge || '/favicon.ico',
      data: payload.data || {},
      tag: isCall ? `nexchat-call-${payload.data?.callId || 'active'}` : (payload.data?.conversationId || 'nexchat-msg'),
      renotify: true,
      requireInteraction: isCall, // Keeps call notification visible on laptop/desktop until handled
      vibrate: isCall ? [500, 250, 500, 250, 500, 250, 500] : [200, 100, 200],
      actions: isCall
        ? [
            { action: 'answer', title: '📞 Answer' },
            { action: 'decline', title: '❌ Decline' }
          ]
        : [
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
      vibrate: [200, 100, 200]
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

// Handle notification click: focus existing window or open conversation / call
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss' || event.action === 'decline') return;

  const notifData = event.notification.data || {};
  const conversationId = notifData.conversationId;
  const isCall = notifData.type === 'call';
  const targetUrl = isCall ? `/?callId=${notifData.callId}` : (conversationId ? `/?conversation=${conversationId}` : '/');

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: isCall ? 'INCOMING_CALL' : 'NAVIGATE_CONVERSATION',
            conversationId: conversationId,
            callId: notifData.callId,
            action: event.action
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
