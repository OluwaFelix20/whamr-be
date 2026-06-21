import { z } from 'zod';

/**
 * Validators for the WhatsApp Cloud API endpoints.
 *
 * Covers only the request *shape*; delivery policy (which sticker hosts are
 * allowed, whether credentials are configured) lives in the service so this
 * file stays free of side effects and env reads.
 */

/**
 * Recipient phone number in (loose) E.164 form. WhatsApp's Cloud API accepts a
 * leading `+` and assorted separators, so we accept those here and let the
 * service normalise to digits before sending. 7–15 digits covers every valid
 * country-code + subscriber-number combination.
 */
const phoneNumber = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s\-().]/g, ''))
  .refine((s) => /^\+?[1-9]\d{6,14}$/.test(s), {
    message: 'Provide a valid phone number in international format, e.g. "15551234567".',
  });

/**
 * The sticker to send, as a publicly fetchable URL. WhatsApp downloads this
 * link itself, so it must be HTTPS and point at a WebP file (the only format
 * WhatsApp accepts for stickers). The allowed host(s) are enforced in the
 * service, not here.
 */
const stickerUrl = z
  .string()
  .trim()
  .url('sticker_url must be a valid URL.')
  .refine((u) => u.startsWith('https://'), { message: 'sticker_url must use HTTPS.' })
  .refine((u) => /\.webp(\?|#|$)/i.test(u), {
    message: 'sticker_url must point at a .webp file (WhatsApp stickers must be WebP).',
  });

/** POST /api/whatsapp/send-sticker */
export const sendStickerSchema = z.object({
  to: phoneNumber,
  sticker_url: stickerUrl,
});
