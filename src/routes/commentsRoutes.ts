import { Router } from 'express';
import {
  getComments,
  createComment,
  deleteComment,
  reportComment,
} from '../controllers/commentsController';
import { authenticate } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import {
  listCommentsQuerySchema,
  createCommentSchema,
  commentIdParamSchema,
} from '../validators/communityValidators';

const router = Router();

// Reading a meme's thread is public; writing requires authentication.
router.get('/', validate(listCommentsQuerySchema, 'query'), getComments);
router.post('/', authenticate, validate(createCommentSchema), createComment);
router.delete('/:id', authenticate, validate(commentIdParamSchema, 'params'), deleteComment);
router.post('/:id/report', authenticate, validate(commentIdParamSchema, 'params'), reportComment);

export default router;
