export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Shape returned to clients — never includes the password hash. */
export type PublicUser = Omit<User, 'password_hash'>;
