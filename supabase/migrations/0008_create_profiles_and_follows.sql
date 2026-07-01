-- Migration: user profiles + follows
-- Adds public profile fields to users and a follows (social graph) table.
--
-- Profiles are a BACKEND concept (email/password accounts). Like favorites/
-- collections, follow rows store plain uuids with NO foreign key to
-- public.users so the id space stays flexible. username is the public handle
-- used in profile URLs; stored lowercased by the app and unique when set.
--
-- Idempotent: `if not exists` / `add column if not exists` make re-running safe.

alter table public.users add column if not exists username text;
alter table public.users add column if not exists display_name text;
alter table public.users add column if not exists bio text;
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists cover_url text;

-- One account per handle (case-insensitive), only when a username is set.
create unique index if not exists idx_users_username_unique
  on public.users (lower(username)) where username is not null;

create table if not exists public.follows (
  id bigint generated always as identity primary key,
  follower_id uuid not null,
  following_id uuid not null,
  created_at timestamptz not null default now(),
  -- One follow edge per (follower, following); can't follow yourself.
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists idx_follows_following on public.follows (following_id);
create index if not exists idx_follows_follower on public.follows (follower_id);

-- Backend uses the service_role key (bypasses RLS). RLS stays enabled so any
-- direct anon/Google client access is governed by its own policies.
alter table public.follows enable row level security;
