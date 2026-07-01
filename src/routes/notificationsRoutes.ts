import { Router } from 'express';
import {
  getNotifications,
  getUnreadCount,
  readOne,
  readAll,
} from '../controllers/notificationsController';
import { authenticate } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { notificationIdParamSchema } from '../validators/notificationsValidators';

const router = Router();

// The whole feed is per-user, so every route requires a valid JWT.
router.use(authenticate);

// Specific paths before the ":id" param route.
router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.post('/read-all', readAll);
router.post('/:id/read', validate(notificationIdParamSchema, 'params'), readOne);

export default router;
