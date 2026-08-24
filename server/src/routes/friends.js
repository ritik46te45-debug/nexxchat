import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  sendFriendRequest, acceptFriendRequest, rejectFriendRequest,
  cancelFriendRequest, getPendingRequests, getSentRequests,
  getFriends, unfriend,
} from '../controllers/friendController.js';

const router = Router();
router.use(authenticate);

router.get('/', getFriends);
router.get('/requests/pending', getPendingRequests);
router.get('/requests/sent', getSentRequests);
router.post('/request/:userId', sendFriendRequest);
router.post('/accept/:requestId', acceptFriendRequest);
router.post('/reject/:requestId', rejectFriendRequest);
router.post('/cancel/:requestId', cancelFriendRequest);
router.delete('/:userId', unfriend);

export default router;
