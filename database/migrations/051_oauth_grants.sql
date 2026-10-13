-- Authorization codes and tokens for the ChatGPT sign-in. Only hashes are stored.
-- The service role is the only reader. No policies: anon and authenticated cannot see the rows.

create table if not exists oauth_grants (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('code', 'access', 'refresh')),
  token_hash text not null unique,
  client_id text not null,
  user_id uuid not null references profiles(id) on delete cascade,
  redirect_uri text,
  code_challenge text,
  scope text,
  resource text,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists oauth_grants_user on oauth_grants (user_id, created_at desc);

alter table oauth_grants enable row level security;

notify pgrst, 'reload schema';
