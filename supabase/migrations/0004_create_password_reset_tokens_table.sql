-- Migration: create password_reset_tokens table
-- One row per issued password-reset token. Only the SHA-256 hash is stored.
-- A token is single-use (used_at) and short-lived (expires_at).

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_tokens_token_hash on public.password_reset_tokens (token_hash);
create index if not exists idx_password_reset_tokens_user_id on public.password_reset_tokens (user_id);

-- Server uses the service_role key (bypasses RLS); keep it closed otherwise.
alter table public.password_reset_tokens enable row level security;
