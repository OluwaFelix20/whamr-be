import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { supabase } from '../config/supabase';
import { PublicUser, User } from '../types/user';
import { signToken } from '../utils/jwt';
import { generateRefreshToken, hashToken } from '../utils/refreshToken';

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

/** Strip the password hash before sending a user back to the client. */
const toPublicUser = (user: User): PublicUser => {
  const { password_hash, ...publicUser } = user;
  return publicUser;
};

/**
 * Issue an access token and a freshly-persisted refresh token for a user.
 * The raw refresh token is returned to the caller; only its hash is stored.
 */
const issueTokens = async (
  user: User
): Promise<{ accessToken: string; refreshToken: string }> => {
  const accessToken = signToken({ sub: user.id, email: user.email });
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
