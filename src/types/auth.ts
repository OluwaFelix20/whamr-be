/** Claims we embed in the JWT and attach to the request once verified. */
export interface JwtUserPayload {
  sub: string; // user id
  email: string;
  ver: number; // user's token_version at issue time; checked for kill-switch
}

// Make `req.user` available (and typed) on every Express request.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtUserPayload;
    }
  }
}
