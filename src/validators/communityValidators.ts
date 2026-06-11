import { z } from 'zod';

/**
 * Validators for the favorites and comments endpoints.
 *
 * meme_id is the string id from data/memes.json (e.g. "m001", "st001") — not a
 * UUID — so it's validated as a bounded non-empty string. Comment ids are the
 * table's bigint identity, which arrives as a numeric string in the URL.
 */

const memeId = z.string().trim().min(1, 'meme_id is required.').max(128);

/** POST /api/favorites */
export const addFavoriteSchema = z.object({
  meme_id: memeId,
});

/** DELETE /api/favorites/:memeId */
export const favoriteParamSchema = z.object({
  memeId: z.string().trim().min(1, 'meme id is required.').max(128),
});

/** GET /api/comments?meme_id=... */
export const listCommentsQuerySchema = z.object({
  meme_id: memeId,
});

/** POST /api/comments */
export const createCommentSchema = z.object({
  meme_id: memeId,
  text: z.string().trim().min(1, 'Comment cannot be empty.').max(1000, 'Comment is too long (max 1000 characters).'),
});

/** DELETE /api/comments/:id and POST /api/comments/:id/report */
export const commentIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Comment id must be a positive integer.'),
});
