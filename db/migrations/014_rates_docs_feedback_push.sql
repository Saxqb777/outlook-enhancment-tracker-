-- Rates: a place to keep any document, and a feedback box. Whole site: notifications on phones and computers.

create table if not exists rate_docs (
  id bigint generated always as identity primary key,
  title text not null,
  route text not null default '',
  supplier text not null default '',
  doc_date date,
  notes text not null default '',
  name text not null,
  mime text not null,
  size bigint not null,
  storage text not null,
  url text not null,
  pathname text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists rate_docs_created_idx on rate_docs (created_at desc);

create table if not exists rate_feedback (
  id bigint generated always as identity primary key,
  user_id uuid references users(id) on delete set null,
  body text not null,
  page text not null default '',
  status text not null default 'new' check (status in ('new', 'working', 'done')),
  reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

-- One row per browser or phone that asked for notifications. It goes away when that sign-in ends.
create table if not exists push_subs (
  id bigint generated always as identity primary key,
  user_id uuid references users(id) on delete cascade,
  vendor_user_id uuid references vendor_users(id) on delete cascade,
  session_id text references sessions(id) on delete cascade,
  vendor_session_id text references vendor_sessions(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text not null default '',
  fails int not null default 0,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  check ((user_id is null) <> (vendor_user_id is null))
);
create index if not exists push_subs_user_idx on push_subs (user_id);
create index if not exists push_subs_vendor_idx on push_subs (vendor_user_id);

-- How far the notification sender has got in each stream of events.
create table if not exists push_state (
  id int primary key check (id = 1),
  case_msg bigint not null default 0,
  approval_ev bigint not null default 0,
  rfq_msg bigint not null default 0,
  point_ev bigint not null default 0,
  feedback bigint not null default 0,
  vendor_join timestamptz not null default now()
);
insert into push_state (id, case_msg, approval_ev, rfq_msg, point_ev, feedback)
select 1, coalesce((select max(id) from case_messages), 0), coalesce((select max(id) from approval_events), 0), coalesce((select max(id) from rfq_messages), 0), coalesce((select max(id) from point_events), 0), 0
on conflict (id) do nothing;
