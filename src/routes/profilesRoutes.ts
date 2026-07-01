import { Router } from 'express';
import {
  getOneProfile,
  updateProfile,
  follow,
  unfollow,
} from '../controllers/profilesController';
import { authenticate } from '../middleware/authMiddleware';
import { optionalAuthenticate } from '../middleware/optionalAuthMiddleware';
import { validate } from '../middleware/validate';
import { updateProfileSchema, handleParamSchema } from '../validators/profilesValidators';

const router = Router();

// Edit own profile. Declared before "/:handle" so "me" isn't treated as a handle.
router.patch('/me', authenticate, validate(updateProfileSchema), updateProfile);

// Public profile view. Optional auth attaches the viewer (for is_self /
// is_following) but never rejects, so signed-out visitors can still view.
router.get('/:handle', optionalAuthenticate, validate(handleParamSchema, 'params'), getOneProfile);

// Follow / unfollow (auth required).
router.post('/:handle/follow', authenticate, validate(handleParamSchema, 'params'), follow);
router.delete('/:handle/follow', authenticate, validate(handleParamSchema, 'params'), unfollow);

export default router;
