import { Router } from 'express';
import { register, login, me, refresh, logout } from '../controllers/authController';
import { authenticate } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { registerSchema, loginSchema, refreshTokenSchema } from '../validators/authValidators';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', validate(refreshTokenSchema), refresh);
router.post('/logout', validate(refreshTokenSchema), logout);
router.get('/me', authenticate, me);

export default router;
