-- Migration: onboarding fields on users
-- `interests` — the categories a user picked during onboarding (a jsonb array of
--   category slugs, e.g. ["naija","dance"]). Persisted server-side so it follows
--   the account across devices; future explore/feed personalisation can use it.
-- `onboarded_at` — set when the user finishes (or skips to the end of) the
--   onboarding flow, so we don't push them into it again.
--
-- Idempotent: `add column if not exists` makes re-running a no-op.

alter table public.users add column if not exists interests jsonb;
alter table public.users add column if not exists onboarded_at timestamptz;
