import { Router } from 'express';
import { getUsers, getUserById } from '../controllers/userController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// All user routes require a valid JWT.
router.use(authenticate);

router.get('/', getUsers);
router.get('/:id', getUserById);

export default router;
