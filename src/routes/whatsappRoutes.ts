import { Router } from 'express';
import { sendStickerMessage } from '../controllers/whatsappController';
import { authenticate } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { sendStickerSchema } from '../validators/whatsappValidators';

const router = Router();

// Sending from our WhatsApp Business number is privileged — gate every route
// behind a valid access token so it can't be driven by anonymous callers.
router.use(authenticate);

router.post('/send-sticker', validate(sendStickerSchema), sendStickerMessage);

export default router;
