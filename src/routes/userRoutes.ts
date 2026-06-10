import { Router } from 'express';
import { getUsers, getUserById } from '../controllers/userController';
import { authenticate } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { userIdParamSchema } from '../validators/userValidators';

const router = Router();

// All user routes require a valid JWT.
router.use(authenticate);

router.get('/', getUsers);
router.get('/:id', validate(userIdParamSchema, 'params'), getUserById);

export default router;
