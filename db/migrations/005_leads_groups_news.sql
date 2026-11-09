-- Several Leads, shared (group) cases, and the "What's new" note.
drop index if exists users_one_lead;

-- People working on a case together with its owner.
create table case_members (
  case_id  bigint not null references cases (id) on delete cascade,
  user_id  uuid not null references users (id) on delete cascade,
  added_by uuid references users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (case_id, user_id)
);
create index case_members_user_idx on case_members (user_id);

-- Which "What's new" note each person has closed.
alter table users add column seen_news int not null default 0;
