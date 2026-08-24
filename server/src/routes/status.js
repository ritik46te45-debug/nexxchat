import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  createStatus,
  getFeedStatuses,
  viewStatus,
  reactToStatus,
  deleteStatus
} from '../controllers/statusController.js';

const router = Router();
router.use(authenticate);

router.post('/', createStatus);
router.get('/feed', getFeedStatuses);
router.post('/:statusId/view', viewStatus);
router.post('/:statusId/react', reactToStatus);
router.delete('/:statusId', deleteStatus);

export default router;
