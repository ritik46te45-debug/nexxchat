import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getOrCreateConversation, getConversations, getConversation,
  updateConversation, clearConversation, deleteConversation,
  createGroup, updateGroupInfo, addGroupMembers, removeGroupMember, changeMemberRole,
  updateDisappearingTimer,
} from '../controllers/conversationController.js';

const router = Router();
router.use(authenticate);

router.get('/', getConversations);
router.post('/group', createGroup);
router.put('/group/:conversationId', updateGroupInfo);
router.post('/group/:conversationId/members', addGroupMembers);
router.delete('/group/:conversationId/members/:memberId', removeGroupMember);
router.put('/group/:conversationId/members/:memberId/role', changeMemberRole);

router.get('/:conversationId', getConversation);
router.post('/private/:userId', getOrCreateConversation);
router.put('/:conversationId', updateConversation);
router.put('/:conversationId/disappearing', updateDisappearingTimer);
router.post('/:conversationId/clear', clearConversation);
router.delete('/:conversationId', deleteConversation);

export default router;
