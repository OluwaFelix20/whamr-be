import sharp from 'sharp';

/**
 * Sticker processing service.
 *
 * Turns an arbitrary image (static or animated) into a WhatsApp / Meta
 * Business API compliant sticker. This is the pure, framework-free core — it
 * takes and returns Buffers and knows nothing about Express — so it stays unit
 * testable and reusable (e.g. from a batch script that pre-bakes the meme
 * library, not just from the HTTP controller).
 *
 * Meta's published sticker requirements (the spec we enforce):
 *   - Exactly 512 x 512 px.
 *   - WebP format.
 *   - Static sticker file:   <= 100 KB.
 *   - Animated sticker file:  <= 500 KB.
 *   (Tray icons are a separate 96 x 96 PNG <= 50 KB — see makeTrayIcon.)
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/api/media#stickers
 */

export const STICKER_SIZE = 512;
export const STATIC_MAX_BYTES = 100 * 1024; // 100 KB
export const ANIMATED_MAX_BYTES = 500 * 1024; // 500 KB

export const TRAY_SIZE = 96;
export const TRAY_MAX_BYTES = 50 * 1024; // 50 KB

/** Fully transparent — used to letterbox non-square inputs without a visible box. */
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

/**
 * Quality steps tried from best to worst. We return the highest quality that
 * fits the byte budget; if even the lowest overflows we report TOO_LARGE rather
 * than silently shipping a non-compliant file.
 */
const QUALITY_LADDER = [95, 90, 80, 70, 60, 50, 40, 30, 20] as const;

export type StickerFit = 'contain' | 'cover';

export interface StickerResult {
  buffer: Buffer;
  animated: boolean;
  frames: number;
  width: number;
  height: number;
  bytes: number;
  /** WebP quality the final encode landed on. */
  quality: number;
}

export interface StickerCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface StickerValidation {
  valid: boolean;
  format: string;
  width: number;
  height: number;
  bytes: number;
  animated: boolean;
  frames: number;
  checks: StickerCheck[];
}

export type StickerErrorCode = 'EMPTY' | 'UNSUPPORTED' | 'TOO_LARGE';

/**
 * Domain error with a stable code the controller maps to an HTTP status.
 * Keeps the service HTTP-agnostic while still letting callers respond precisely.
 */
export class StickerError extends Error {
  constructor(
    public readonly code: StickerErrorCode,
    message: string,
    public readonly meta?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'StickerError';
  }
}

/**
 * Read just enough metadata to decide static vs animated and how big the source
 * is. `animated: true` makes sharp expose every frame (pages) so we never
 * accidentally flatten an animation to its first frame.
 */
async function probe(input: Buffer) {
  if (!input || input.length === 0) {
    throw new StickerError('EMPTY', 'No image data was provided.');
  }
  try {
    return await sharp(input, { animated: true }).metadata();
  } catch {
    throw new StickerError(
      'UNSUPPORTED',
      'The file could not be read as an image. Supported inputs include PNG, JPEG, WebP, GIF and TIFF.'
    );
  }
}

/**
 * Encode one attempt: resize to a square 512x512 canvas and write WebP at the
 * given quality. Rebuilt from the source buffer each call — sharp pipelines are
 * single-shot, and the resize cost is negligible next to WebP encoding.
 */
async function encode(
  input: Buffer,
  animated: boolean,
  fit: StickerFit,
  quality: number
): Promise<Buffer> {
  return sharp(input, { animated })
    .resize(STICKER_SIZE, STICKER_SIZE, {
      // `contain` letterboxes onto transparency (never crops — preserves the
      // whole image); `cover` fills the square and crops the overflow.
      fit,
      background: TRANSPARENT,
      // Animated frames are preserved and resized per-frame because the source
      // was opened with `animated: true`.
    })
    .webp({
      quality,
      alphaQuality: 100,
      // More effort = smaller files; animated encodes are heavier so we ease
      // off slightly to keep latency sane on the free Render tier.
      effort: animated ? 5 : 6,
      // smartSubsample improves quality-per-byte on detailed art.
      smartSubsample: true,
    })
    .toBuffer();
}

/**
 * Convert an arbitrary image into a spec-compliant sticker.
 *
 * Auto-detects animation, forces a 512x512 WebP, and walks the quality ladder
 * until the file fits its budget (100 KB static / 500 KB animated), returning
 * the highest quality that fits. Throws StickerError('TOO_LARGE') if nothing on
 * the ladder fits — better an honest failure than a sticker Meta will reject.
 */
export async function processSticker(
  input: Buffer,
  opts: { fit?: StickerFit } = {}
): Promise<StickerResult> {
  const fit: StickerFit = opts.fit ?? 'contain';
  const meta = await probe(input);

  const frames = meta.pages ?? 1;
  const animated = frames > 1;
  const maxBytes = animated ? ANIMATED_MAX_BYTES : STATIC_MAX_BYTES;

  let smallest: { buffer: Buffer; quality: number } | null = null;

  for (const quality of QUALITY_LADDER) {
    const buffer = await encode(input, animated, fit, quality);

    if (buffer.length <= maxBytes) {
      return {
        buffer,
        animated,
        frames,
        width: STICKER_SIZE,
        height: STICKER_SIZE,
        bytes: buffer.length,
        quality,
      };
    }
    // Track the smallest (lowest quality) attempt for an accurate error.
    smallest = { buffer, quality };
  }

  throw new StickerError(
    'TOO_LARGE',
    `Could not compress this ${animated ? 'animated' : 'static'} sticker under ` +
      `${Math.round(maxBytes / 1024)} KB. Smallest achievable was ` +
      `${Math.round((smallest?.buffer.length ?? 0) / 1024)} KB at quality ${smallest?.quality}. ` +
      `Try a shorter clip, fewer frames, or a simpler image.`,
    { bytes: smallest?.buffer.length, maxBytes, animated, frames }
  );
}

/**
 * Build the pack's tray icon: a 96x96 PNG under 50 KB. Meta requires one per
 * sticker pack. Not part of the static/animated sticker spec, but packs are
 * rejected without it, so the service owns it too.
 */
export async function makeTrayIcon(
  input: Buffer,
  opts: { fit?: StickerFit } = {}
): Promise<{ buffer: Buffer; width: number; height: number; bytes: number }> {
  const fit: StickerFit = opts.fit ?? 'contain';
  await probe(input);

  // PNG has no quality dial; step the colour palette down until it fits.
  for (const colours of [256, 128, 64, 32, 16]) {
    const buffer = await sharp(input, { animated: false })
      .resize(TRAY_SIZE, TRAY_SIZE, { fit, background: TRANSPARENT })
      .png({ palette: true, colours, compressionLevel: 9, effort: 10 })
      .toBuffer();

    if (buffer.length <= TRAY_MAX_BYTES) {
      return { buffer, width: TRAY_SIZE, height: TRAY_SIZE, bytes: buffer.length };
    }
  }

  throw new StickerError(
    'TOO_LARGE',
    `Could not compress the tray icon under ${Math.round(TRAY_MAX_BYTES / 1024)} KB.`,
    { maxBytes: TRAY_MAX_BYTES }
  );
}

/**
 * Inspect an existing file and report, check by check, whether it already meets
 * the sticker spec. Useful for QA before submitting assets for Meta approval —
 * it grades, it does not transform.
 */
export async function validateSticker(input: Buffer): Promise<StickerValidation> {
  const meta = await probe(input);

  const format = meta.format ?? 'unknown';
  const frames = meta.pages ?? 1;
  const animated = frames > 1;
  const width = meta.width ?? 0;
  // For animations sharp reports `height` as the full frame strip
  // (pageHeight x pages); the per-frame height — what the sticker spec measures
  // — is `pageHeight`.
  const height = animated ? meta.pageHeight ?? 0 : meta.height ?? 0;
  const bytes = input.length;
  const maxBytes = animated ? ANIMATED_MAX_BYTES : STATIC_MAX_BYTES;

  const checks: StickerCheck[] = [
    {
      name: 'format',
      pass: format === 'webp',
      detail: `Format is ${format}; required WebP.`,
    },
    {
      name: 'dimensions',
      pass: width === STICKER_SIZE && height === STICKER_SIZE,
      detail: `${width}x${height}px; required ${STICKER_SIZE}x${STICKER_SIZE}px.`,
    },
    {
      name: 'fileSize',
      pass: bytes <= maxBytes,
      detail:
        `${Math.round(bytes / 1024)} KB; max ` +
        `${Math.round(maxBytes / 1024)} KB for ${animated ? 'animated' : 'static'}.`,
    },
  ];

  return {
    valid: checks.every((c) => c.pass),
    format,
    width,
    height,
    bytes,
    animated,
    frames,
    checks,
  };
}
