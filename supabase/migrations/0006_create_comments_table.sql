-- Migration: create comments table
-- Public comments on a meme. Like favorites, user_id may be a backend users.id
-- (email/password) or a Supabase auth uid (Google), so it is a plain uuid with
-- NO foreign key to public.users. author_name is denormalised (the email handle
-- at post time) so the feed renders without a join. `reported` flags a comment
-- for moderation; an admin (ADMIN_USER_IDS) or the author can delete it.
--
-- Idempotent: the live table already exists (created by the frontend). This file
-- documents the canonical shape; `if not exists` makes re-running a no-op.

create table if not exists public.comments (
  id bigint generated always as identity primary key,
  meme_id text not null,
  user_id uuid not null,
  author_name text not null,
  text text not null,
  reported boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_comments_meme_id on public.comments (meme_id);
create index if not exists idx_comments_user_id on public.comments (user_id);

-- Backend uses the service_role key (bypasses RLS). RLS stays enabled so the
-- anon/Google client keeps its existing public-read / own-write policies.
alter table public.comments enable row level security;
