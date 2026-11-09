-- Files attached to points (proof with a status change, or with an update).
create table attachments (
  id          bigint generated always as identity primary key,
  case_id     bigint not null references cases (id) on delete cascade,
  point_id    bigint not null references points (id) on delete cascade,
  event_id    bigint references point_events (id) on delete set null,
  uploaded_by uuid references users (id) on delete set null,
  name        text not null,
  mime        text not null,
  size        int not null,
  storage     text not null check (storage in ('blob', 'local')),
  url         text not null,
  pathname    text not null,
  created_at  timestamptz not null default now()
);
create index attachments_point_idx on attachments (point_id);
create index attachments_case_idx on attachments (case_id);
create index attachments_event_idx on attachments (event_id);

-- Only used when the app runs without Vercel file storage (local testing).
create table attachment_local (
  key        text primary key,
  point_id   bigint not null references points (id) on delete cascade,
  data       bytea not null,
  created_at timestamptz not null default now()
);
