-- Approvals: anyone asks, the chosen people sign. Separate from cases and from Lead / Member roles.
create table approvals (
  id           bigint generated always as identity primary key,
  requester_id uuid not null references users (id),
  title        text not null,
  body         text not null default '',
  status       text not null default 'open' check (status in ('open', 'signed', 'rejected', 'cancelled')),
  version      int not null default 1,
  needed_by    date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  closed_at    timestamptz
);
create index approvals_requester_idx on approvals (requester_id);

create table approval_signers (
  approval_id    bigint not null references approvals (id) on delete cascade,
  user_id        uuid not null references users (id),
  state          text not null default 'pending' check (state in ('pending', 'signed', 'sent_back', 'rejected')),
  signed_version int,
  signature      text,
  comment        text,
  decided_at     timestamptz,
  primary key (approval_id, user_id)
);
create index approval_signers_user_idx on approval_signers (user_id);

create table approval_files (
  id          bigint generated always as identity primary key,
  approval_id bigint not null references approvals (id) on delete cascade,
  version     int not null,
  name        text not null,
  mime        text not null,
  size        int not null,
  storage     text not null check (storage in ('blob', 'local')),
  url         text not null,
  pathname    text not null,
  created_at  timestamptz not null default now()
);
create index approval_files_idx on approval_files (approval_id, version);

-- The record: every signature, send-back, reply and new version, in order. Never edited.
create table approval_events (
  id          bigint generated always as identity primary key,
  approval_id bigint not null references approvals (id) on delete cascade,
  user_id     uuid references users (id) on delete set null,
  kind        text not null check (kind in ('created', 'signed', 'sent_back', 'rejected', 'reply', 'new_version', 'cancelled', 'reminded')),
  text        text,
  version     int not null,
  signature   text,
  created_at  timestamptz not null default now()
);
create index approval_events_idx on approval_events (approval_id, id);

alter table users add column saved_signature text;
alter table attachment_local alter column point_id drop not null;
