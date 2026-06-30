import { z } from 'zod';

/**
 * Validators for the collections endpoints.
 *
 * Collection ids are the table's bigint identity, arriving as a numeric string
 * in the URL. meme_id is the string id from data/memes.json (e.g. "m001") — not
 * a UUID — so it's a bounded non-empty string, consistent with the favorites and
 * comments validators.
 */

const memeId = z.string().trim().min(1, 'meme_id is required.').max(128);

const name = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(80, 'Name is too long (max 80 characters).');

const description = z
  .string()
  .trim()
  .max(500, 'Description is too long (max 500 characters).')
  .nullable();

/** POST /api/collections */
export const createCollectionSchema = z.object({
  name,
  description: description.optional(),
  is_public: z.boolean().optional(),
});

/**
 * PATCH /api/collections/:id — every field optional, but at least one must be
 * present so an empty PATCH is rejected rather than silently doing nothing.
 */
export const updateCollectionSchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
    is_public: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update (name, description, or is_public).',
  });

/** :id route param (collection id). */
export const collectionIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Collection id must be a positive integer.'),
});

/** POST /api/collections/:id/items */
export const addItemSchema = z.object({
  meme_id: memeId,
});

/** DELETE /api/collections/:id/items/:memeId */
export const itemParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Collection id must be a positive integer.'),
  memeId: z.string().trim().min(1, 'meme id is required.').max(128),
});
