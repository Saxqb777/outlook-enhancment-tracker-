-- Safety fixes after the independent review.
-- Sign-in limits per network address, so a stranger can't lock a real person out.
alter table login_attempts add column ip text;
create index login_attempts_ip_at on login_attempts (ip, at desc);

-- Reset links for vendor people too.
alter table password_resets alter column user_id drop not null;
alter table password_resets add column vendor_user_id uuid references vendor_users (id) on delete cascade;

-- Cases can be archived (hidden from the lists, never deleted).
alter table cases add column archived_at timestamptz;
alter table cases add column archived_by uuid references users (id) on delete set null;

-- Who did what, for sensitive actions.
create table activity_log (
  id             bigint generated always as identity primary key,
  user_id        uuid references users (id) on delete set null,
  vendor_user_id uuid references vendor_users (id) on delete set null,
  kind           text not null,
  detail         text not null default '',
  created_at     timestamptz not null default now()
);
create index activity_log_idx on activity_log (created_at desc);

-- When old records were last cleaned up.
create table housekeeping (
  id       int primary key default 1 check (id = 1),
  last_run timestamptz not null default now() - interval '2 days'
);
insert into housekeeping (id) values (1);
