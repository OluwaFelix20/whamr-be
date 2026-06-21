/**
 * WhatsApp Cloud API service.
 *
 * Framework-free core for sending messages through the WhatsApp Business
 * Platform (Cloud API). Like stickerService, it takes/returns plain values and
 * knows nothing about Express, so it can be reused from a script, a queue
 * worker, or the HTTP controller.
 *
 * Sticker delivery uses the *link* method: WhatsApp fetches the WebP itself
 * from a public URL (our stickers live on Cloudflare R2), so we never have to
 * upload media bytes to Meta first. The sticker must be a WebP that meets
 * Meta's size limits (static <= 100 KB, animated <= 500 KB) — the same files
 * stickerService already produces.
 *
 * Reference:
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
 */

const GRAPH_BASE = 'https://graph.facebook.com';

/** Graph API version. Pinned so Meta's rolling changes never surprise us. */
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0';

/**
 * Hosts WhatsApp is allowed to fetch sticker links from. Restricting this stops
 * the endpoint being abused to push arbitrary links through our WhatsApp
 * Business number. Defaults cover our R2 public bucket and the Vercel
 * same-origin `/r2` proxy; override with a comma-separated env list if needed.
 */
const DEFAULT_ALLOWED_STICKER_HOSTS = [
  'pub-16e03d1bc3f74001b6190ac5b3c763dd.r2.dev',
  'whamr-application.vercel.app',
];

function allowedStickerHosts(): string[] {
  const fromEnv = (process.env.WHATSAPP_ALLOWED_STICKER_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_ALLOWED_STICKER_HOSTS;
}

export type WhatsAppErrorCode =
  | 'CONFIG' // server is missing WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID
  | 'INVALID_STICKER' // sticker_url host is not allow-listed
  | 'API_ERROR'; // Meta rejected the request (bad number, expired token, etc.)

/**
 * A typed failure the controller can map to an HTTP status. `status` carries
 * Meta's HTTP status when the failure came from the Graph API; `details` holds
 * Meta's structured error payload (never includes our token).
 */
export class WhatsAppError extends Error {
  readonly code: WhatsAppErrorCode;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    code: WhatsAppErrorCode,
    message: string,
    opts: { status?: number; details?: unknown } = {}
  ) {
    super(message);
    this.name = 'WhatsAppError';
    this.code = code;
    this.status = opts.status;
    this.details = opts.details;
  }
}

export interface SendStickerResult {
  /** Meta's message id (wamid...), useful for tracking delivery/read status. */
  messageId: string;
  /** The normalised recipient WhatsApp echoed back, when provided. */
  recipient: string;
}

interface WhatsAppCredentials {
  token: string;
  phoneNumberId: string;
}

/** Read + assert the Cloud API credentials. Throws CONFIG if either is absent. */
function credentials(): WhatsAppCredentials {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new WhatsAppError(
      'CONFIG',
      'WhatsApp is not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.'
    );
  }
  return { token, phoneNumberId };
}

/** Reject sticker links whose host isn't on the allow-list. */
function assertAllowedSticker(stickerUrl: string): void {
  let host: string;
  try {
    host = new URL(stickerUrl).hostname.toLowerCase();
  } catch {
    throw new WhatsAppError('INVALID_STICKER', 'sticker_url is not a valid URL.');
  }
  if (!allowedStickerHosts().includes(host)) {
    throw new WhatsAppError(
      'INVALID_STICKER',
      `sticker_url host "${host}" is not allowed. Stickers must be served from an approved host.`
    );
  }
}

/** Normalise a recipient to the bare digits WhatsApp expects (no '+'/separators). */
function normaliseRecipient(to: string): string {
  return to.replace(/[^\d]/g, '');
}

/**
 * Send a sticker to a WhatsApp user by link.
 *
 * @param to         Recipient phone number in international format (with or
 *                   without a leading '+').
 * @param stickerUrl Public HTTPS URL of a WebP sticker on an allow-listed host.
 * @returns          The Meta message id and echoed recipient.
 * @throws WhatsAppError on missing config, a disallowed sticker host, or a
 *         Graph API rejection.
 */
export async function sendSticker(to: string, stickerUrl: string): Promise<SendStickerResult> {
  // Validate the request (client errors) before reading server config, so a
  // disallowed sticker host reports 400 even when credentials are unset.
  assertAllowedSticker(stickerUrl);
  const { token, phoneNumberId } = credentials();

  const recipient = normaliseRecipient(to);
  const endpoint = `${GRAPH_BASE}/${API_VERSION}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'sticker',
    sticker: { link: stickerUrl },
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Network/TLS failure reaching Meta — never the client's fault.
    throw new WhatsAppError('API_ERROR', `Could not reach WhatsApp: ${(err as Error).message}`, {
      status: 502,
    });
  }

  // Meta always replies JSON; parse defensively in case of an edge gateway error.
  const body: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const metaError = (body as { error?: { message?: string } }).error;
    throw new WhatsAppError(
      'API_ERROR',
      metaError?.message
        ? `WhatsApp rejected the message: ${metaError.message}`
        : `WhatsApp returned ${response.status}.`,
      { status: response.status, details: metaError ?? body }
    );
  }

  const ok = body as {
    messages?: Array<{ id?: string }>;
    contacts?: Array<{ wa_id?: string }>;
  };
  const messageId = ok.messages?.[0]?.id;
  if (!messageId) {
    throw new WhatsAppError('API_ERROR', 'WhatsApp accepted the request but returned no message id.', {
      status: 502,
      details: body,
    });
  }

  return {
    messageId,
    recipient: ok.contacts?.[0]?.wa_id ?? recipient,
  };
}
