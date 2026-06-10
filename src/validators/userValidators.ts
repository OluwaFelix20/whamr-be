import { z } from 'zod';

/** `:id` route param must be a UUID (matches the users.id column type). */
export const userIdParamSchema = z.object({
  id: z.uuid({ message: 'User id must be a valid UUID.' }),
});
