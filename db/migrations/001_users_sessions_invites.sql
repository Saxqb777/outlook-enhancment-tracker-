-- Step 2: people, sign-in sessions and invites.

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  name          text not null,
  role          text not null check (role in ('lead', 'member')),
  status        text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  password_hash text,
  created_by    uuid references users (id) on delete set null,
  created_at    timestamptz not null default now(),
  activated_at  timestamptz,
  last_login_at timestamptz
);

-- One account per email, whatever the casing.
create unique index users_email_key on users (lower(email));
-- Only one Lead for now.
create unique index users_one_lead on users (role) where role = 'lead';

-- A session row per signed-in browser. The cookie holds a random token;
-- only its SHA-256 hash is stored here.
create table sessions (
  id         text primary key,
  user_id    uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);

-- One open invite per invited person. Only the token's hash is stored,
-- so a link can be shown once and never read back.
create table invites (
  token_hash text primary key,
  user_id    uuid not null unique references users (id) on delete cascade,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Used to slow down password guessing.
create table login_attempts (
  id    bigint generated always as identity primary key,
  email text not null,
  ok    boolean not null,
  at    timestamptz not null default now()
);
create index login_attempts_email_at on login_attempts (lower(email), at desc);
