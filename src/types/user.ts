export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  token_version: number;
  created_at: string;
  updated_at: string;
}

/** Shape returned to clients — never includes the password hash or internals. */
export type PublicUser = Omit<User, 'password_hash' | 'token_version'>;
