import { Router } from 'express';
import {
  listMyCollections,
  createMyCollection,
  getOneCollection,
  updateMyCollection,
  deleteMyCollection,
  addCollectionItem,
  removeCollectionItem,
} from '../controllers/collectionsController';
import { authenticate } from '../middleware/authMiddleware';
import { optionalAuthenticate } from '../middleware/optionalAuthMiddleware';
import { validate } from '../middleware/validate';
import {
  createCollectionSchema,
  updateCollectionSchema,
  collectionIdParamSchema,
  addItemSchema,
  itemParamSchema,
} from '../validators/collectionsValidators';

const router = Router();

// Owner-only: list and create the current user's collections.
router.get('/', authenticate, listMyCollections);
router.post('/', authenticate, validate(createCollectionSchema), createMyCollection);

// Public-readable: anyone can view a public collection; the owner additionally
// sees their private ones. Optional auth attaches req.user when a valid token is
// present but never rejects, so signed-out viewers still reach public lists.
router.get('/:id', optionalAuthenticate, validate(collectionIdParamSchema, 'params'), getOneCollection);

// Owner-only mutations.
router.patch(
  '/:id',
  authenticate,
  validate(collectionIdParamSchema, 'params'),
  validate(updateCollectionSchema),
  updateMyCollection
);
router.delete('/:id', authenticate, validate(collectionIdParamSchema, 'params'), deleteMyCollection);

// Items within a collection (owner-only).
router.post(
  '/:id/items',
  authenticate,
  validate(collectionIdParamSchema, 'params'),
  validate(addItemSchema),
  addCollectionItem
);
router.delete(
  '/:id/items/:memeId',
  authenticate,
  validate(itemParamSchema, 'params'),
  removeCollectionItem
);

export default router;
