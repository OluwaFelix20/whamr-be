import { Router } from 'express';
import {
  getFavorites,
  addFavorite,
  removeFavorite,
} from '../controllers/favoritesController';
import { authenticate } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import {
  addFavoriteSchema,
  favoriteParamSchema,
} from '../validators/communityValidators';

const router = Router();

// All favourites are per-user, so every route requires a valid JWT.
router.use(authenticate);

router.get('/', getFavorites);
router.post('/', validate(addFavoriteSchema), addFavorite);
router.delete('/:memeId', validate(favoriteParamSchema, 'params'), removeFavorite);

export default router;
