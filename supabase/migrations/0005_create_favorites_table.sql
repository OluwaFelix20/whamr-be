-- Migration: create favorites table
-- One row per (user, meme) the user has favourited. Shared with the frontend's
-- existing favourites: rows may be keyed either on a backend users.id (email/
-- password accounts) OR a Supabase auth uid (Google sign-ins), so user_id is a
-- plain uuid with NO foreign key to public.users — both id spaces coexist here.
-- meme_id is the string id from data/memes.json (e.g. "m001", "st001").
--
-- Idempotent: the live table already exists (created by the frontend). This file
-- documents the canonical shape; `if not exists` makes re-running a no-op.

create table if not exists public.favorites (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  meme_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_favorites_user_id on public.favorites (user_id);
create index if not exists idx_favorites_meme_id on public.favorites (meme_id);

-- The backend uses the service_role key (bypasses RLS). RLS stays enabled so the
-- anon/Google client is governed by its own policies; the backend is unaffected.
alter table public.favorites enable row level security;

-- Note: there is intentionally NO unique(user_id, meme_id) constraint — the live
-- data already contains duplicate rows, so the backend de-dups in code (checks
-- for an existing row before inserting) instead of relying on the database.
