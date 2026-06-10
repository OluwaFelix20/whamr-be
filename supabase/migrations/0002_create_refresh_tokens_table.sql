-- Migration: create refresh_tokens table
-- Stores one row per issued refresh token. Only the SHA-256 hash of the token
-- is persisted (never the raw token), so a DB leak does not expose usable
-- tokens. Rotation revokes the old row and inserts a new one.

create table if not exists public.refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_refresh_tokens_token_hash on public.refresh_tokens (token_hash);
create index if not exists idx_refresh_tokens_user_id on public.refresh_tokens (user_id);

-- Server uses the service_role key (bypasses RLS); keep the table closed to
-- anon/authenticated clients.
alter table public.refresh_tokens enable row level security;
