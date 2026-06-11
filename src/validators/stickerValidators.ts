import { z } from 'zod';

/**
 * Validators for the sticker endpoints.
 *
 * The image itself arrives as a multipart file (handled by multer, not Zod);
 * these schemas only cover the optional text fields that ride alongside it.
 */

/**
 * POST /api/stickers/process and /tray — optional `fit` field.
 *   - contain (default): letterbox onto transparency, never crops.
 *   - cover: fill the 512x512 square and crop the overflow.
 * Validated after multer has parsed the multipart body.
 */
export const stickerOptionsSchema = z.object({
  fit: z.enum(['contain', 'cover']).optional(),
});
