import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { convert, tray, validate } from '../controllers/stickerController';
import { authenticate } from '../middleware/authMiddleware';
import { validate as validateBody } from '../middleware/validate';
import { stickerOptionsSchema } from '../validators/stickerValidators';

const router = Router();

/**
 * Max accepted upload. Source art is generally far smaller than this, but
 * animated GIF/WebP can be chunky, so we allow headroom while still capping
 * memory use (uploads are buffered in memory, never written to disk).
 */
const MAX_UPLOAD_BYTES = Number(process.env.STICKER_MAX_UPLOAD_BYTES) || 25 * 1024 * 1024; // 25 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    // Reject obvious non-images early; the service still re-validates the bytes.
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported content type "${file.mimetype}". Upload an image.`));
  },
});

/**
 * Run multer for a single `image` field and translate its errors into JSON with
 * the right status, instead of letting them bubble to the generic 500 handler:
 *   - file too big        -> 413
 *   - non-image / filter  -> 415
 *   - other multer errors -> 400
 */
function uploadImage(field: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    upload.single(field)(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            error: `Image exceeds the ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB upload limit.`,
          });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(415).json({ error: (err as Error).message || 'Unsupported upload.' });
    });
  };
}

// All sticker endpoints require authentication — image transcoding is CPU-heavy
// (libvips), so we gate it behind a valid access token to prevent abuse.
router.use(authenticate);

router.post('/process', uploadImage('image'), validateBody(stickerOptionsSchema), convert);
router.post('/tray', uploadImage('image'), validateBody(stickerOptionsSchema), tray);
router.post('/validate', uploadImage('image'), validate);

export default router;
