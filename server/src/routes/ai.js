import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getThreads,
  getThread,
  deleteThread,
  chatStream,
  chat,
  generateImage,
  summarizeConversation,
  assistMessage,
} from '../controllers/aiController.js';

const router = Router();

router.use(authenticate);

router.get('/threads', getThreads);
router.get('/threads/:threadId', getThread);
router.delete('/threads/:threadId', deleteThread);

router.post('/chat', chat);
router.post('/chat/stream', chatStream);
router.post('/generate-image', generateImage);
router.post('/summarize/:conversationId', summarizeConversation);
router.post('/assist', assistMessage);

export default router;
