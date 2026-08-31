import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  registerDevice,
  updatePushToken,
  revokeDevice,
  listDevices,
  deleteDevice,
  deviceHeartbeat,
} from '../controllers/deviceController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Register or update a device
router.post('/register', registerDevice);

// Update push token (FCM token rotation)
router.put('/token', updatePushToken);

// Heartbeat (keep device active)
router.post('/heartbeat', deviceHeartbeat);

// List all user devices
router.get('/', listDevices);

// Revoke a device (logout)
router.put('/:deviceId/revoke', revokeDevice);

// Delete a device permanently
router.delete('/:deviceId', deleteDevice);

export default router;
