-- Admin (view only), AI reading log, several emails per case (original + replies), original files.

alter table users drop constraint users_role_check;
alter table users add constraint users_role_check check (role in ('lead', 'member', 'admin'));
alter table invites drop constraint invites_role_check;
alter table invites add constraint invites_role_check check (role in ('lead', 'member', 'admin'));

-- Every AI read, so the Admin can spot problems.
create table ai_reads (
  id         bigint generated always as identity primary key,
  user_id    uuid references users (id) on delete set null,
  kind       text not null default 'new' check (kind in ('new', 'reply')),
  ok         boolean not null,
  ms         int not null,
  chars      int not null,
  points     int,
  error      text,
  created_at timestamptz not null default now()
);
create index ai_reads_created_idx on ai_reads (created_at desc);

-- The emails on a case: position 0 is the original, then Reply 1, Reply 2 ...
create table case_emails (
  id          bigint generated always as identity primary key,
  case_id     bigint not null references cases (id) on delete cascade,
  position    int not null,
  from_name   text not null default '',
  from_email  text not null default '',
  email_to    text not null default '',
  email_sent  text not null default '',
  subject     text not null default '',
  body        text not null,
  source      text not null default 'paste' check (source in ('paste', 'file')),
  file_name   text,
  change_note text,
  added_by    uuid references users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (case_id, position)
);

-- The uploaded file itself (PDF, .eml, .msg), kept so people can open the real email.
create table email_files (
  email_id   bigint primary key references case_emails (id) on delete cascade,
  name       text not null,
  mime       text not null,
  size       int not null,
  data       bytea not null,
  created_at timestamptz not null default now()
);

alter table points add column email_id bigint references case_emails (id) on delete set null;
alter table point_events add column email_id bigint references case_emails (id) on delete set null;
alter table point_events drop constraint point_events_kind_check;
alter table point_events add constraint point_events_kind_check
  check (kind in ('created', 'status', 'update', 'remark', 'due', 'reopen', 'reply'));

-- Existing cases: their email becomes the original.
insert into case_emails (case_id, position, from_name, from_email, email_to, email_sent, subject, body, source, file_name, added_by, created_at)
select id, 0, from_name, from_email, email_to, email_sent, subject, email_body, source, file_name, created_by, created_at from cases;
update points p set email_id = e.id from case_emails e where e.case_id = p.case_id and e.position = 0 and p.source_quote is not null;
