-- Migration: add token_version to users
-- Embedded in each access token as the `ver` claim. The authenticate
-- middleware rejects tokens whose `ver` no longer matches the user's current
-- token_version, so incrementing this column instantly invalidates every
-- outstanding access token for that user (kill-switch).

alter table public.users
  add column if not exists token_version integer not null default 0;
