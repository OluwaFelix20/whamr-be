import { z } from 'zod';

/** :id route param (notification id — the table's bigint identity). */
export const notificationIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Notification id must be a positive integer.'),
});
