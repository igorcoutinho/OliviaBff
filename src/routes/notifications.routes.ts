import { Router } from 'express';
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} from '../controllers/notifications.controller';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

router.get('/', authMiddleware, listNotifications);
router.get('/unread-count', authMiddleware, unreadCount);
router.post('/read-all', authMiddleware, markAllRead);
router.post('/:id/read', authMiddleware, markRead);

export default router;
