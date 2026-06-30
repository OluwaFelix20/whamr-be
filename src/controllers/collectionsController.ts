import { Request, Response } from 'express';
import {
  CollectionsError,
  listCollections,
  createCollection,
  getCollection,
  updateCollection,
  deleteCollection,
  addItem,
  removeItem,
} from '../services/collectionsService';

/**
 * Thin HTTP layer over collectionsService. Pulls typed values off the request,
 * calls the service, and maps the service's typed errors to HTTP statuses. All
 * domain logic and ownership checks live in the service.
 */

/** Map a CollectionsError code to an HTTP status; rethrow anything else. */
function handleError(err: unknown, res: Response): void {
  if (err instanceof CollectionsError) {
    const status =
      err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'FORBIDDEN'
          ? 403
          : err.code === 'CONFLICT'
            ? 409
            : 500; // DB
    res.status(status).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: (err as Error).message });
}

/** GET /api/collections — the current user's collections. */
export const listMyCollections = async (req: Request, res: Response): Promise<void> => {
  try {
    const collections = await listCollections(req.user!.sub);
    res.status(200).json({ collections });
  } catch (err) {
    handleError(err, res);
  }
};

/** POST /api/collections — create a collection. */
export const createMyCollection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, is_public } = req.body as {
      name: string;
      description?: string | null;
      is_public?: boolean;
    };
    const collection = await createCollection(req.user!.sub, { name, description, is_public });
    res.status(201).json({ collection });
  } catch (err) {
    handleError(err, res);
  }
};

/**
 * GET /api/collections/:id — view a collection with its items.
 * Public collections are visible to anyone; private ones only to their owner
 * (reported as 404 otherwise). Uses optional auth, so req.user may be absent.
 */
export const getOneCollection = async (req: Request, res: Response): Promise<void> => {
  try {
    const collectionId = Number(req.params.id);
    const requesterId = req.user?.sub ?? null;
    const collection = await getCollection(collectionId, requesterId);
    res.status(200).json({ collection });
  } catch (err) {
    handleError(err, res);
  }
};

/** PATCH /api/collections/:id — rename / re-describe / toggle visibility. */
export const updateMyCollection = async (req: Request, res: Response): Promise<void> => {
  try {
    const collectionId = Number(req.params.id);
    const patch = req.body as { name?: string; description?: string | null; is_public?: boolean };
    const collection = await updateCollection(req.user!.sub, collectionId, patch);
    res.status(200).json({ collection });
  } catch (err) {
    handleError(err, res);
  }
};

/** DELETE /api/collections/:id — delete a collection (items cascade). */
export const deleteMyCollection = async (req: Request, res: Response): Promise<void> => {
  try {
    const collectionId = Number(req.params.id);
    await deleteCollection(req.user!.sub, collectionId);
    res.status(200).json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
};

/** POST /api/collections/:id/items  { meme_id } — add a meme. */
export const addCollectionItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const collectionId = Number(req.params.id);
    const { meme_id } = req.body as { meme_id: string };
    await addItem(req.user!.sub, collectionId, meme_id);
    res.status(201).json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
};

/** DELETE /api/collections/:id/items/:memeId — remove a meme. */
export const removeCollectionItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const collectionId = Number(req.params.id);
    const memeId = String(req.params.memeId);
    await removeItem(req.user!.sub, collectionId, memeId);
    res.status(200).json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
};
