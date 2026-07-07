import { Router } from 'express';
import { messagesController } from './messages.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';

const router = Router();

router.use(authenticate, setTenant);

router.get('/', messagesController.getInbox);
router.get('/conversations', messagesController.getConversations);
router.get('/history/:userId', messagesController.getConversationHistory);
router.post('/', messagesController.sendMessage);

export default router;
