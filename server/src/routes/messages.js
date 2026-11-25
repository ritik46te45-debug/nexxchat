import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  sendMessage, getMessages, editMessage, deleteMessage,
  reactToMessage, toggleStarMessage, getStarredMessages,
  forwardMessage, searchMessages, markAsRead,
  getMediaGallery, pinMessage, unpinMessage, votePoll,
  markViewOnceOpened, syncMessages, ackMessageDelivery, getLinkPreview,
} from '../controllers/messageController.js';

const router = Router();

// HMAC-authenticated delivery receipt from Service Worker / background push arrival
router.post('/delivery-ack', ackMessageDelivery);

router.use(authenticate);

// Sync missed messages on reconnect
router.get('/sync', syncMessages);

// Link preview metadata
router.post('/link-preview', getLinkPreview);

// Starred messages
router.get('/starred', getStarredMessages);

// Search
router.get('/search', searchMessages);

// Conversation messages
router.get('/:conversationId', getMessages);
router.post('/:conversationId', sendMessage);
router.post('/:conversationId/read', markAsRead);
router.get('/:conversationId/media', getMediaGallery);

// Pin
router.post('/:conversationId/pin/:messageId', pinMessage);
router.delete('/:conversationId/pin/:messageId', unpinMessage);

// Individual message operations
router.put('/:messageId/edit', editMessage);
router.delete('/:messageId', deleteMessage);
router.post('/:messageId/react', reactToMessage);
router.post('/:messageId/star', toggleStarMessage);
router.post('/:messageId/forward', forwardMessage);
router.post('/:messageId/poll/vote', votePoll);
router.post('/:messageId/view-once', markViewOnceOpened);

export default router;
