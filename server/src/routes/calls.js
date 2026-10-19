import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getCallHistory, clearCallHistory, getIceConfig, getActiveCall } from '../controllers/callController.js';

const router = Router();
router.use(authenticate);

router.get('/active', getActiveCall);
router.get('/history', getCallHistory);
router.delete('/history', clearCallHistory);
router.get('/ice-servers', getIceConfig);

export default router;

