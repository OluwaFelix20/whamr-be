import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { supabase } from '../config/supabase';

/**
 * Protect a route by requiring a valid `Authorization: Bearer <token>` header.
 *
 * Beyond verifying the JWT signature/expiry, this checks the token's `ver`
 * claim against the user's current `token_version` in the database. Bumping a
 * user's token_version (e.g. on logout-all) therefore invalidates every
 * outstanding access token immediately — a kill-switch. The cost is one DB
 * lookup per authenticated request.
 *
 * On success, attaches the decoded payload to `req.user` and calls next().
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Missing or malformed Authorization header. Expected "Bearer <token>".',
    });
    return;
  }

  const token = header.slice('Bearer '.length).trim();

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('token_version')
      .eq('id', payload.sub)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // User deleted, or token issued before the current version => revoked.
    if (!user || user.token_version !== payload.ver) {
      res.status(401).json({ error: 'Token has been revoked.' });
      return;
    }

    req.user = payload;
    next();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};
