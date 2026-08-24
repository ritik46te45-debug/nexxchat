import webPush from 'web-push';
import dotenv from 'dotenv';
dotenv.config();

// VAPID keys — check environment or use pre-generated production keys
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidPublicKey || !vapidPrivateKey) {
  // Generate a stable pair if not provided in environment
  const vapidKeys = webPush.generateVAPIDKeys();
  vapidPublicKey = vapidKeys.publicKey;
  vapidPrivateKey = vapidKeys.privateKey;
  console.log('🔑 Generated VAPID Keys for Web Push Notifications');
}

webPush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:support@nexchat.app',
  vapidPublicKey,
  vapidPrivateKey
);

export const getVapidPublicKey = () => vapidPublicKey;

export const sendPushNotification = async (subscription, payload) => {
  try {
    if (!subscription || !subscription.endpoint) return null;
    const dataString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return await webPush.sendNotification(subscription, dataString);
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      // Subscription has expired or is no longer valid
      console.warn('⚠️ Web Push subscription expired:', subscription.endpoint);
      return { expired: true, endpoint: subscription.endpoint };
    }
    console.warn('Web Push error:', error.message);
    return null;
  }
};

export default webPush;
