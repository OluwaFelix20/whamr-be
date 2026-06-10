const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:4000';

/**
 * Send a password reset email.
 *
 * No email transport is configured in this project, so as a development
 * fallback the reset link is logged to the server console. Swap the body for a
 * real transport (SMTP / Resend / SES) in production — the rest of the flow
 * (token generation, hashing, verification) does not change.
 */
export const sendPasswordResetEmail = async (email: string, token: string): Promise<void> => {
  const resetUrl = `${APP_BASE_URL}/reset-password?token=${token}`;
  // eslint-disable-next-line no-console
  console.log(`[mailer] Password reset link for ${email}: ${resetUrl}`);
};
