import User from '../models/User.js';
import { getVapidPublicKey, sendPushNotification } from '../config/webPush.js';

// GET VAPID PUBLIC KEY
export const getPublicKey = (req, res) => {
  try {
    const key = getVapidPublicKey();
    res.json({ publicKey: key });
  } catch (error) {
    console.error('Error fetching VAPID public key:', error);
    res.status(500).json({ error: 'Failed to get VAPID public key' });
  }
};

// SUBSCRIBE TO WEB PUSH
export const subscribePush = async (req, res) => {
  try {
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Invalid push subscription object' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove any existing subscription with the same endpoint to avoid duplicates
    user.pushSubscriptions = user.pushSubscriptions.filter(
      (sub) => sub.endpoint !== subscription.endpoint
    );

    // Add new subscription
    user.pushSubscriptions.push({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      userAgent: req.headers['user-agent'] || '',
      createdAt: new Date(),
    });

    await user.save();

    // Send a welcome test push notification to verify the pipeline
    sendPushNotification(subscription, {
      title: 'NexChat Notifications Enabled',
      body: 'You will now receive instant message alerts on this device even when the browser is closed.',
      icon: user.avatar?.url || '/favicon.ico',
      badge: '/favicon.ico',
      data: { type: 'welcome' },
    }).catch((e) => console.warn('Welcome push note:', e.message));

    res.status(201).json({ message: 'Push subscription registered successfully' });
  } catch (error) {
    console.error('Subscribe push error:', error);
    res.status(500).json({ error: 'Failed to register push subscription' });
  }
};

// UNSUBSCRIBE FROM WEB PUSH
export const unsubscribePush = async (req, res) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: 'Subscription endpoint is required' });
    }

    await User.findByIdAndUpdate(req.userId, {
      $pull: { pushSubscriptions: { endpoint } },
    });

    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Unsubscribe push error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
};

// GET IN-APP NOTIFICATIONS
export const getNotifications = async (req, res) => {
  try {
    const query = {
      recipient: req.userId,
      type: { $nin: ['message', 'group_message'] },
    };

    const notifications = await Notification.find(query)
      .populate('sender', 'displayName username avatar userCode')
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      ...query,
      isRead: false,
    });

    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
};

// MARK ALL NOTIFICATIONS AS READ
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
};

// CLEAR ALL NOTIFICATIONS
export const clearNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({ recipient: req.userId });
    res.json({ message: 'Notifications cleared' });
  } catch (error) {
    console.error('Clear notifications error:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
};
