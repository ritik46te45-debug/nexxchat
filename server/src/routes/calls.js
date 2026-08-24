import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getCallHistory, clearCallHistory } from '../controllers/callController.js';

const router = Router();
router.use(authenticate);

router.get('/history', getCallHistory);
router.delete('/history', clearCallHistory);

export default router;
