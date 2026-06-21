import { Request, Response } from 'express';
import { sendSticker, WhatsAppError } from '../services/whatsappService';

/**
 * WhatsApp endpoints. The Cloud API integration lives in
 * services/whatsappService.ts; these handlers only translate HTTP <-> service:
 * pull the validated body, call the service, and map WhatsAppError codes to
 * status codes.
 *
 * WhatsAppError -> HTTP:
 *   CONFIG          -> 503 (server not configured — not the caller's fault)
 *   INVALID_STICKER -> 400 (sticker_url host not allowed)
 *   API_ERROR       -> Meta's status if known (e.g. 400/401), else 502
 */
function handleError(err: unknown, res: Response): void {
  if (err instanceof WhatsAppError) {
    if (err.code === 'CONFIG') {
      res.status(503).json({ error: err.message, code: err.code });
      return;
    }
    if (err.code === 'INVALID_STICKER') {
      res.status(400).json({ error: err.message, code: err.code });
      return;
    }
    // API_ERROR — surface Meta's status when we have it, default to 502.
    res.status(err.status ?? 502).json({ error: err.message, code: err.code, details: err.details });
    return;
  }
  res.status(500).json({ error: (err as Error).message });
}

/**
 * POST /api/whatsapp/send-sticker
 * Body: `{ to, sticker_url }` (validated upstream).
 * Sends the WebP sticker at `sticker_url` to the `to` phone number via the
 * WhatsApp Cloud API (link method). Responds 200 with Meta's message id.
 */
export const sendStickerMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { to, sticker_url } = req.body as { to: string; sticker_url: string };
    const result = await sendSticker(to, sticker_url);
    res.status(200).json({
      ok: true,
      message_id: result.messageId,
      recipient: result.recipient,
    });
  } catch (err) {
    handleError(err, res);
  }
};
