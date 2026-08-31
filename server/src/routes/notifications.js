import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getPublicKey,
  subscribePush,
  unsubscribePush,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  clearNotifications,
} from '../controllers/notificationController.js';

const router = Router();

// Public route to fetch VAPID public key
router.get('/vapid-key', getPublicKey);

// Protected routes
router.use(authenticate);
router.get('/', getNotifications);
router.put('/read-all', markAllNotificationsAsRead);
router.put('/:id/read', markNotificationAsRead);
router.delete('/clear', clearNotifications);
router.post('/subscribe', subscribePush);
router.post('/unsubscribe', unsubscribePush);

export default router;
