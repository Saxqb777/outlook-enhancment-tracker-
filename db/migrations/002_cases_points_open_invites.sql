-- Step 3 + 4: cases (one per email), points (one per ask), point activity,
-- and invite links that let a person type their own name and email.

-- A person can be invited before we know their email; they add it when they join.
alter table users alter column email drop not null;

-- Invite links: tied to a pre-named person (user_id set) or open (user_id null,
-- a new Member is created when the link is used).
alter table invites alter column user_id drop not null;
alter table invites add column role text not null default 'member' check (role in ('lead', 'member'));
alter table invites add column label text;

create table cases (
  id             bigint generated always as identity primary key,
  owner_id       uuid not null references users (id),
  created_by     uuid references users (id) on delete set null,
  subject        text not null,
  summary        text not null default '',
  from_name      text not null default '',
  from_email     text not null default '',
  company        text not null default '',
  priority       text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  deadline       date,
  email_to       text not null default '',
  email_sent     text not null default '',
  email_body     text not null,
  source         text not null default 'paste' check (source in ('paste', 'file')),
  file_name      text,
  details        jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index cases_owner_idx on cases (owner_id);
create index cases_created_idx on cases (created_at desc);

create table points (
  id           bigint generated always as identity primary key,
  case_id      bigint not null references cases (id) on delete cascade,
  position     int not null,
  text         text not null,
  source_quote text,
  status       text not null default 'todo' check (status in ('todo', 'progress', 'wait', 'done', 'approved')),
  wait_reason  text,
  due          date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index points_case_idx on points (case_id, position);
create index points_status_idx on points (status);

create table point_events (
  id         bigint generated always as identity primary key,
  point_id   bigint not null references points (id) on delete cascade,
  user_id    uuid references users (id) on delete set null,
  kind       text not null check (kind in ('created', 'status', 'update', 'remark', 'due', 'reopen')),
  text       text,
  status     text,
  due        date,
  created_at timestamptz not null default now()
);
create index point_events_point_idx on point_events (point_id, created_at);
