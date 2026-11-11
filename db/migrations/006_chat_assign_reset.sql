-- Password reset links, point assignees, case chat and read markers.
create table password_resets (
  token_hash text primary key,
  user_id    uuid not null references users (id) on delete cascade,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table points add column assignee_id uuid references users (id) on delete set null;

create table case_messages (
  id         bigint generated always as identity primary key,
  case_id    bigint not null references cases (id) on delete cascade,
  user_id    uuid references users (id) on delete set null,
  kind       text not null check (kind in ('text', 'ai', 'system')),
  body       text not null,
  point_id   bigint references points (id) on delete set null,
  actions    jsonb,
  created_at timestamptz not null default now()
);
create index case_messages_case_idx on case_messages (case_id, id);

create table case_reads (
  case_id      bigint not null references cases (id) on delete cascade,
  user_id      uuid not null references users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (case_id, user_id)
);

alter table ai_reads drop constraint ai_reads_kind_check;
alter table ai_reads add constraint ai_reads_kind_check check (kind in ('new', 'reply', 'chat'));
