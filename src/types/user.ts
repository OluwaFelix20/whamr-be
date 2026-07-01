export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  // Public profile fields (added in migration 0008; null until the user sets them).
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  // Onboarding fields (migration 0010).
  interests: string[] | null;
  onboarded_at: string | null;
  token_version: number;
  created_at: string;
  updated_at: string;
}

/** Shape returned to clients — never includes the password hash or internals. */
export type PublicUser = Omit<User, 'password_hash' | 'token_version'>;
