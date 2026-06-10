import crypto from 'crypto';

const PASSWORD_RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 60);
const MS_PER_MINUTE = 60 * 1000;

/**
 * Mint a single-use password reset token. Returns the raw token (to email to
 * the user) and its expiry; the caller stores only the hash.
 */
export const generatePasswordResetToken = (): { token: string; expiresAt: string } => {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * MS_PER_MINUTE).toISOString();
  return { token, expiresAt };
};
