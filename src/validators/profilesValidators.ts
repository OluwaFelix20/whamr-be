import { z } from 'zod';

/**
 * Validators for the profiles endpoints.
 *
 * `username` is the public handle: 3–20 chars of letters/digits/underscore,
 * stored lowercase. URLs for avatar/cover must be https. Every field on the
 * update is optional, but at least one must be present.
 */

const username = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,20}$/, 'Username must be 3–20 letters, numbers or underscores.')
  .transform((s) => s.toLowerCase());

const displayName = z.string().trim().max(50, 'Display name is too long (max 50).').nullable();
const bio = z.string().trim().max(300, 'Bio is too long (max 300 characters).').nullable();

const httpsUrl = z
  .string()
  .trim()
  .max(600)
  .url('Must be a valid URL.')
  .refine((u) => u.startsWith('https://'), 'URL must start with https://')
  .nullable();

/** PATCH /api/profiles/me */
export const updateProfileSchema = z
  .object({
    username: username.optional(),
    display_name: displayName.optional(),
    bio: bio.optional(),
    avatar_url: httpsUrl.optional(),
    cover_url: httpsUrl.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update.',
  });

/** :handle route param (username or uuid). */
export const handleParamSchema = z.object({
  handle: z.string().trim().min(1, 'A profile handle is required.').max(64),
});
