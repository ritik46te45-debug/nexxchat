import webPush from 'web-push';
import dotenv from 'dotenv';
dotenv.config();

// Stable permanent VAPID keys so push subscriptions never break across server restarts
const DEFAULT_VAPID_PUBLIC_KEY = 'BAx4nhchItRZUwG2labo03mFeHdmCH9y6TFn3mxT69lMm9ELOZ24S_K5WsjLbVS0iARZZQM2svINqQnXYD4zGO4';
const DEFAULT_VAPID_PRIVATE_KEY = 'walG8pWdUt6XFstodPG9oWAUVW_bevy9-l65g2-wUW0';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY;

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
