-- Migration: create users table
-- Source of truth for application users. Passwords are stored as bcrypt hashes.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at in sync on every update.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
  before update on public.users
  for each row
  execute function public.set_updated_at();

-- Index for fast email lookups during login/registration.
create index if not exists idx_users_email on public.users (email);

-- Enable Row Level Security. The server uses the service_role key, which
-- bypasses RLS; this keeps the table closed to anon/authenticated clients.
alter table public.users enable row level security;
