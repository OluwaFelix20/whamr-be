import { Resend } from 'resend';

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:4000';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM ?? 'Whamr <onboarding@resend.dev>';

// Created lazily/once. When no API key is configured we fall back to logging the
// link to the console, so local dev and tests work without an email provider.
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const resetEmailHtml = (resetUrl: string): string => `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
    <h2 style="margin: 0 0 12px;">Reset your password</h2>
    <p style="margin: 0 0 20px; color: #444;">
      We received a request to reset your Whamr password. This link expires soon and can be used once.
    </p>
    <p style="margin: 0 0 24px;">
      <a href="${resetUrl}" style="display: inline-block; padding: 12px 22px; background: #ff3366; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset password</a>
    </p>
    <p style="margin: 0 0 8px; color: #888; font-size: 13px;">Or paste this link into your browser:</p>
    <p style="margin: 0 0 24px; word-break: break-all; font-size: 13px;"><a href="${resetUrl}">${resetUrl}</a></p>
    <p style="margin: 0; color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
  </div>
`;

/**
 * Send a password reset email via Resend. If RESEND_API_KEY is not set, the
 * reset link is logged to the console instead (development fallback). Throws if
 * the provider returns an error so the caller can decide how to handle it.
 */
export const sendPasswordResetEmail = async (email: string, token: string): Promise<void> => {
  const resetUrl = `${APP_BASE_URL}/reset-password?token=${token}`;

  if (!resend) {
    // eslint-disable-next-line no-console
    console.log(`[mailer] (no RESEND_API_KEY set) reset link for ${email}: ${resetUrl}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: MAIL_FROM,
    to: email,
    subject: 'Reset your Whamr password',
    html: resetEmailHtml(resetUrl),
    text: `Reset your Whamr password using this link (expires soon, single use):\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
  });

  if (error) {
    throw new Error(`Resend failed to send reset email: ${error.message || String(error)}`);
  }
};
