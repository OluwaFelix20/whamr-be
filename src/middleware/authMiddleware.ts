import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';

/**
 * Protect a route by requiring a valid `Authorization: Bearer <token>` header.
 * On success, attaches the decoded payload to `req.user` and calls next().
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Missing or malformed Authorization header. Expected "Bearer <token>".',
    });
    return;
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};
