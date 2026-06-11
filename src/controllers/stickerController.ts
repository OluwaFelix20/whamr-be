import { Request, Response } from 'express';
import {
  processSticker,
  makeTrayIcon,
  validateSticker,
  StickerError,
  StickerFit,
} from '../services/stickerService';

/**
 * Sticker endpoints. The heavy lifting lives in services/stickerService.ts;
 * these handlers only translate HTTP <-> service: pull the uploaded buffer,
 * pick options, and map StickerError codes to status codes.
 *
 * StickerError -> HTTP:
 *   EMPTY       -> 400 (no usable image data)
 *   UNSUPPORTED -> 415 (not a decodable image)
 *   TOO_LARGE   -> 422 (cannot be compressed within spec)
 */
function statusForStickerError(code: StickerError['code']): number {
  switch (code) {
    case 'EMPTY':
      return 400;
    case 'UNSUPPORTED':
      return 415;
    case 'TOO_LARGE':
      return 422;
    default:
      return 500;
  }
}

function handleError(err: unknown, res: Response): void {
  if (err instanceof StickerError) {
    res.status(statusForStickerError(err.code)).json({ error: err.message, code: err.code });
    return;
  }
  res.status(500).json({ error: (err as Error).message });
}

/** The validated `fit` option (multer put text fields on req.body). */
function fitOf(req: Request): StickerFit | undefined {
  return (req.body as { fit?: StickerFit })?.fit;
}

/**
 * POST /api/stickers/process
 * Multipart `image` -> a 512x512 WebP sticker compliant with Meta's spec
 * (static <=100 KB, animated <=500 KB; animation auto-detected and preserved).
 *
 * Responds with the raw WebP bytes (`Content-Type: image/webp`) so the caller
 * can pipe them straight into a `.wastickers` pack or upload to storage. The
 * computed properties are echoed in `X-Sticker-*` headers (exposed via CORS) so
 * a browser fetch can read them without a second round-trip. Add `?download=1`
 * to force a file download.
 */
export const convert = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'An image file is required (multipart field "image").' });
      return;
    }

    const result = await processSticker(req.file.buffer, { fit: fitOf(req) });

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Length', result.bytes);
    res.setHeader('X-Sticker-Animated', String(result.animated));
    res.setHeader('X-Sticker-Frames', String(result.frames));
    res.setHeader('X-Sticker-Width', String(result.width));
    res.setHeader('X-Sticker-Height', String(result.height));
    res.setHeader('X-Sticker-Bytes', String(result.bytes));
    res.setHeader('X-Sticker-Quality', String(result.quality));
    // Let browsers on the frontend origin read the metadata headers.
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-Sticker-Animated, X-Sticker-Frames, X-Sticker-Width, X-Sticker-Height, X-Sticker-Bytes, X-Sticker-Quality'
    );
    if (req.query.download !== undefined) {
      const ext = result.animated ? 'animated' : 'static';
      res.setHeader('Content-Disposition', `attachment; filename="sticker-${ext}.webp"`);
    }

    res.status(200).send(result.buffer);
  } catch (err) {
    handleError(err, res);
  }
};

/**
 * POST /api/stickers/tray
 * Multipart `image` -> a 96x96 PNG tray icon (<=50 KB). Every sticker pack
 * needs one, so the API can produce it from the same source art.
 */
export const tray = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'An image file is required (multipart field "image").' });
      return;
    }

    const result = await makeTrayIcon(req.file.buffer, { fit: fitOf(req) });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', result.bytes);
    res.setHeader('X-Sticker-Width', String(result.width));
    res.setHeader('X-Sticker-Height', String(result.height));
    res.setHeader('X-Sticker-Bytes', String(result.bytes));
    res.setHeader('Access-Control-Expose-Headers', 'X-Sticker-Width, X-Sticker-Height, X-Sticker-Bytes');
    if (req.query.download !== undefined) {
      res.setHeader('Content-Disposition', 'attachment; filename="tray.png"');
    }

    res.status(200).send(result.buffer);
  } catch (err) {
    handleError(err, res);
  }
};

/**
 * POST /api/stickers/validate
 * Multipart `image` -> a JSON report grading the file against the sticker spec
 * (format / dimensions / file size). Inspects only; never transforms. Useful
 * for QA before submitting assets for Meta Business API approval.
 */
export const validate = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'An image file is required (multipart field "image").' });
      return;
    }

    const report = await validateSticker(req.file.buffer);
    // 200 regardless of pass/fail — the request succeeded; `valid` carries the
    // verdict. (Only an unreadable image throws, mapped below.)
    res.status(200).json(report);
  } catch (err) {
    handleError(err, res);
  }
};
