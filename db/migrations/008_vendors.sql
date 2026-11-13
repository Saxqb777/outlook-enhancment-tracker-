-- Vendors (transporters) with their own portal, and quote requests sent to them.
-- Vendor people sign in with their own accounts and sessions, fully apart from the team's.
create table vendors (
  id          bigint generated always as identity primary key,
  name        text not null,
  services    text[] not null default '{}',
  areas       text not null default '',
  phone       text not null default '',
  notes       text not null default '',
  status      text not null default 'active' check (status in ('active', 'off')),
  invite_hash text unique,
  invite_expires timestamptz,
  created_by  uuid references users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index vendors_name_key on vendors (lower(name));

create table vendor_users (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     bigint not null references vendors (id) on delete cascade,
  name          text not null,
  email         text not null,
  password_hash text not null,
  status        text not null default 'active' check (status in ('active', 'disabled')),
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index vendor_users_email_key on vendor_users (lower(email));
create index vendor_users_vendor_idx on vendor_users (vendor_id);

create table vendor_sessions (
  id             text primary key,
  vendor_user_id uuid not null references vendor_users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null
);

-- Saved request forms: a list of field names the team reuses.
create table rfq_templates (
  id         bigint generated always as identity primary key,
  name       text not null,
  fields     jsonb not null,
  created_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index rfq_templates_name_key on rfq_templates (lower(name));

create table rfqs (
  id                bigint generated always as identity primary key,
  title             text not null,
  fields            jsonb not null default '[]',
  notes             text not null default '',
  case_id           bigint references cases (id) on delete set null,
  reply_by          date,
  status            text not null default 'open' check (status in ('open', 'pending_award', 'awarded', 'confirmed', 'done', 'cancelled')),
  created_by        uuid not null references users (id),
  awarded_vendor_id bigint references vendors (id),
  award_by          uuid references users (id),
  award_note        text,
  awarded_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  closed_at         timestamptz
);
create index rfqs_created_by_idx on rfqs (created_by);

create table rfq_vendors (
  rfq_id         bigint not null references rfqs (id) on delete cascade,
  vendor_id      bigint not null references vendors (id) on delete cascade,
  state          text not null default 'invited' check (state in ('invited', 'quoted', 'declined')),
  price          numeric(14, 2),
  currency       text,
  valid_until    date,
  ready_on       date,
  note           text,
  decline_reason text,
  quoted_at      timestamptz,
  vendor_read_at timestamptz,
  added_at       timestamptz not null default now(),
  primary key (rfq_id, vendor_id)
);
create index rfq_vendors_vendor_idx on rfq_vendors (vendor_id);

-- Every price a vendor gave, so changes stay on record.
create table rfq_quotes (
  id             bigint generated always as identity primary key,
  rfq_id         bigint not null references rfqs (id) on delete cascade,
  vendor_id      bigint not null references vendors (id) on delete cascade,
  vendor_user_id uuid references vendor_users (id) on delete set null,
  price          numeric(14, 2) not null,
  currency       text not null,
  valid_until    date,
  ready_on       date,
  note           text,
  created_at     timestamptz not null default now()
);
create index rfq_quotes_idx on rfq_quotes (rfq_id, vendor_id, id);

-- One chat per request per vendor. 'internal' rows are for the team only and never shown to vendors.
create table rfq_messages (
  id             bigint generated always as identity primary key,
  rfq_id         bigint not null references rfqs (id) on delete cascade,
  vendor_id      bigint not null references vendors (id) on delete cascade,
  user_id        uuid references users (id) on delete set null,
  vendor_user_id uuid references vendor_users (id) on delete set null,
  kind           text not null default 'text' check (kind in ('text', 'system', 'internal')),
  body           text not null,
  created_at     timestamptz not null default now()
);
create index rfq_messages_idx on rfq_messages (rfq_id, vendor_id, id);
create index rfq_messages_time_idx on rfq_messages (created_at);

create table rfq_files (
  id         bigint generated always as identity primary key,
  rfq_id     bigint not null references rfqs (id) on delete cascade,
  vendor_id  bigint references vendors (id) on delete cascade,
  name       text not null,
  mime       text not null,
  size       int not null,
  storage    text not null check (storage in ('blob', 'local')),
  url        text not null,
  pathname   text not null,
  created_at timestamptz not null default now()
);
create index rfq_files_idx on rfq_files (rfq_id);

create table rfq_reads (
  rfq_id       bigint not null references rfqs (id) on delete cascade,
  vendor_id    bigint not null references vendors (id) on delete cascade,
  user_id      uuid not null references users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (rfq_id, vendor_id, user_id)
);
