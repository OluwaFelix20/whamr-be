import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { supabase } from '../config/supabase';

/**
 * Soft authentication for routes that are usable both signed-in and signed-out
 * (e.g. viewing a public collection, where the owner additionally sees private
 * ones and edit controls).
 *
 * Unlike `authenticate`, this never rejects: if there's no token, an invalid or
 * expired token, or a revoked one, the request simply proceeds as anonymous
 * (`req.user` stays undefined). When a valid, non-revoked token is present,
 * `req.user` is attached exactly as `authenticate` would.
 */
export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = header.slice('Bearer '.length).trim();

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    next(); // invalid/expired → treat as anonymous
    return;
  }

  try {
    const { data: user } = await supabase
      .from('users')
      .select('token_version')
      .eq('id', payload.sub)
      .maybeSingle();

    // Only trust the token if the user still exists and the version matches.
    if (user && user.token_version === payload.ver) {
      req.user = payload;
    }
  } catch {
    // A lookup failure shouldn't block a public read — fall through anonymous.
  }

  next();
};
