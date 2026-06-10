import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { supabase } from '../config/supabase';
import { PublicUser, User } from '../types/user';
import { signToken } from '../utils/jwt';
import { generateRefreshToken, hashToken } from '../utils/refreshToken';
import { generatePasswordResetToken } from '../utils/passwordReset';
import { sendPasswordResetEmail } from '../utils/mailer';

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

/** Strip the password hash and internals before sending a user to the client. */
const toPublicUser = (user: User): PublicUser => {
  const { password_hash, token_version, ...publicUser } = user;
  return publicUser;
};

/**
 * Issue an access token and a freshly-persisted refresh token for a user.
 * The raw refresh token is returned to the caller; only its hash is stored.
 */
const issueTokens = async (
  user: User
): Promise<{ accessToken: string; refreshToken: string }> => {
  const accessToken = signToken({ sub: user.id, email: user.email, ver: user.token_version });
  const { token, tokenHash, expiresAt } = generateRefreshToken();

  const { error } = await supabase.from('refresh_tokens').insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { accessToken, refreshToken: token };
};

/**
 * POST /api/auth/register
 * Create a new user with a bcrypt-hashed password.
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, full_name } = req.body;

    // Reject duplicate emails up front for a clearer error.
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists.' });
      return;
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const { data, error } = await supabase
      .from('users')
      .insert({ email, password_hash, full_name: full_name ?? null })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const user = data as User;
    const { accessToken, refreshToken } = await issueTokens(user);
    res.status(201).json({ user: toPublicUser(user), accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * POST /api/auth/login
 * Verify credentials against the bcrypt hash stored in Supabase.
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, (user as User).password_hash);
    if (!passwordMatches) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const authedUser = user as User;
    const { accessToken, refreshToken } = await issueTokens(authedUser);
    res.status(200).json({ user: toPublicUser(authedUser), accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * GET /api/auth/me
 * Return the currently authenticated user. Requires the `authenticate`
 * middleware to have populated `req.user` from a valid JWT.
 */
export const me = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.sub)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Token is valid but the user no longer exists (e.g. deleted).
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.status(200).json({ user: toPublicUser(user as User) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
}

/**
 * POST /api/auth/refresh
 * Exchange a valid refresh token for a new access + refresh token pair.
 * Implements rotation: the presented token is revoked and replaced. Reuse of
 * an already-revoked token is treated as theft and revokes the whole family.
 */
export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const tokenHash = hashToken(req.body.refreshToken);

    const { data: row, error } = await supabase
      .from('refresh_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!row) {
      res.status(401).json({ error: 'Invalid refresh token.' });
      return;
    }

    const tokenRow = row as RefreshTokenRow;

    // Reuse of a revoked token => likely stolen. Revoke every active token for
    // this user so an attacker cannot keep refreshing.
    if (tokenRow.revoked_at) {
      await supabase
        .from('refresh_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', tokenRow.user_id)
        .is('revoked_at', null);
      res.status(401).json({ error: 'Refresh token has been revoked.' });
      return;
    }

    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      res.status(401).json({ error: 'Refresh token has expired.' });
      return;
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', tokenRow.user_id)
      .maybeSingle();

    if (userError) {
      res.status(500).json({ error: userError.message });
      return;
    }

    if (!user) {
      res.status(401).json({ error: 'Invalid refresh token.' });
      return;
    }

    // Rotate: revoke the presented token, then issue a fresh pair.
    await supabase
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', tokenRow.id);

    const { accessToken, refreshToken } = await issueTokens(user as User);
    res.status(200).json({ accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * POST /api/auth/logout
 * Revoke a refresh token. Idempotent: always 200 so it cannot be used to probe
 * which tokens exist.
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const tokenHash = hashToken(req.body.refreshToken);

    await supabase
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)
      .is('revoked_at', null);

    res.status(200).json({ message: 'Logged out.' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * POST /api/auth/logout-all
 * Revoke every active refresh token for the authenticated user (log out of all
 * sessions/devices). Requires a valid access token; identity comes from the JWT.
 */
export const logoutAll = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const { data, error } = await supabase
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', req.user.sub)
      .is('revoked_at', null)
      .select('id');

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Bump token_version to instantly invalidate all outstanding access tokens
    // (including the one used for this request). req.user.ver is the current
    // value — the authenticate middleware just verified it matches the DB.
    const { error: versionError } = await supabase
      .from('users')
      .update({ token_version: req.user.ver + 1 })
      .eq('id', req.user.sub);

    if (versionError) {
      res.status(500).json({ error: versionError.message });
      return;
    }

    res.status(200).json({
      message: 'Logged out of all sessions.',
      revokedCount: data?.length ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * POST /api/auth/forgot-password
 * Issue a single-use password reset token and email it to the user. Always
 * responds 200 with a generic message so the endpoint cannot be used to
 * enumerate which emails are registered.
 */
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (user) {
      // Invalidate any earlier unused reset tokens so only the newest is valid.
      await supabase
        .from('password_reset_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('used_at', null);

      const { token, expiresAt } = generatePasswordResetToken();
      const { error } = await supabase.from('password_reset_tokens').insert({
        user_id: user.id,
        token_hash: hashToken(token),
        expires_at: expiresAt,
      });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // A delivery failure must not change the response (that would leak which
      // emails are registered). Log it server-side and still return the generic
      // 200 — the token is stored, so the user can simply request another link.
      try {
        await sendPasswordResetEmail(email, token);
      } catch (mailErr) {
        console.error('Password reset email failed to send:', mailErr);
      }
    }

    res.status(200).json({
      message: 'If an account exists for that email, a password reset link has been sent.',
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
}

/**
 * POST /api/auth/reset-password
 * Consume a valid reset token, set the new password, and invalidate all
 * existing sessions (bump token_version + revoke refresh tokens).
 */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword } = req.body;
    const tokenHash = hashToken(token);

    const { data: row, error } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const resetRow = row as PasswordResetTokenRow | null;

    if (!resetRow || resetRow.used_at || new Date(resetRow.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'Invalid or expired reset token.' });
      return;
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('token_version')
      .eq('id', resetRow.user_id)
      .maybeSingle();

    if (userError) {
      res.status(500).json({ error: userError.message });
      return;
    }

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired reset token.' });
      return;
    }

    const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Set the new password and bump token_version to kill all access tokens.
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash, token_version: user.token_version + 1 })
      .eq('id', resetRow.user_id);

    if (updateError) {
      res.status(500).json({ error: updateError.message });
      return;
    }

    // Consume the token and revoke all refresh tokens (full logout).
    await supabase
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', resetRow.id);

    await supabase
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', resetRow.user_id)
      .is('revoked_at', null);

    res.status(200).json({ message: 'Password has been reset. Please log in again.' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};
