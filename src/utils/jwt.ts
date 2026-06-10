import jwt, { SignOptions } from 'jsonwebtoken';
import { JwtUserPayload } from '../types/auth';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

/**
 * Read the secret lazily so it is resolved after dotenv has populated the
 * environment, regardless of module import order.
 */
const getSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Missing JWT_SECRET environment variable.');
  }
  return secret;
};

/** Sign a short-lived access token for an authenticated user. */
export const signToken = (payload: JwtUserPayload): string =>
  jwt.sign(payload, getSecret(), { expiresIn: JWT_EXPIRES_IN } as SignOptions);

/** Verify a token and return its payload, or throw if invalid/expired. */
export const verifyToken = (token: string): JwtUserPayload =>
  jwt.verify(token, getSecret()) as JwtUserPayload;
