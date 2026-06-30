-- Migration: create collections + collection_items tables
-- A "collection" is a named, optionally-public list of memes a user saves
-- (think playlists). Two tables:
--   collections        — one row per collection (owner, name, visibility)
--   collection_items   — one row per meme inside a collection
--
-- Like favorites/comments, user_id may be a backend users.id (email/password)
-- or a Supabase auth uid (Google), so it is a plain uuid with NO foreign key to
-- public.users — both id spaces coexist. meme_id is the string id from
-- data/memes.json (e.g. "m001", "st001").
--
-- Idempotent: `if not exists` makes re-running a no-op.

create table if not exists public.collections (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  name text not null,
  description text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_collections_user_id on public.collections (user_id);
create index if not exists idx_collections_public on public.collections (is_public) where is_public;

create table if not exists public.collection_items (
  id bigint generated always as identity primary key,
  collection_id bigint not null references public.collections (id) on delete cascade,
  meme_id text not null,
  created_at timestamptz not null default now(),
  -- A meme appears at most once per collection. Unlike favorites, this table is
  -- new (no legacy duplicates), so we can enforce uniqueness in the database.
  unique (collection_id, meme_id)
);

create index if not exists idx_collection_items_collection_id
  on public.collection_items (collection_id);

-- The backend uses the service_role key (bypasses RLS). RLS stays enabled so any
-- direct anon/Google client access is governed by its own policies.
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
