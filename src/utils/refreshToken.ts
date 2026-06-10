import crypto from 'crypto';

const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** SHA-256 hash (hex) — what we store, so a DB leak yields no usable tokens. */
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

/**
 * Mint a new opaque refresh token. Returns the raw token to hand to the client
 * plus the hash and expiry to persist.
 */
export const generateRefreshToken = (): {
  token: string;
  tokenHash: string;
  expiresAt: string;
} => {
  const token = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * MS_PER_DAY).toISOString();
  return { token, tokenHash: hashToken(token), expiresAt };
};
