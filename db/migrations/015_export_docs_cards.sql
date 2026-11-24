-- Export Docs: one record per export shipment with all its documents. Card Expenses: every card payment, by hand.

alter table users add column if not exists can_docs boolean not null default false;

create table if not exists xd_types (
  id bigint generated always as identity primary key,
  name text not null,
  position int not null default 100,
  active boolean not null default true
);
create unique index if not exists xd_types_name_idx on xd_types (lower(name));
insert into xd_types (name, position) values ('Invoice', 10), ('Packing List', 20), ('Certificate of Origin (COO)', 30), ('Health Certificate', 40), ('Phytosanitary Certificate', 50), ('Bill of Lading (BL)', 60), ('Bill of Entry (BOE)', 70), ('Duty Exemption', 80)
on conflict do nothing;

create table if not exists xd_categories (
  id bigint generated always as identity primary key,
  name text not null,
  position int not null default 100,
  active boolean not null default true
);
create unique index if not exists xd_categories_name_idx on xd_categories (lower(name));
insert into xd_categories (name, position) values ('Documentation', 10), ('Duty exemption', 20), ('Food', 30), ('Visitors', 40), ('Other', 90)
on conflict do nothing;

create table if not exists xd_cards (
  id bigint generated always as identity primary key,
  name text not null,
  credit_limit numeric(12, 2) not null default 25000,
  alert_at numeric(12, 2) not null default 20000,
  statement_day int not null default 18 check (statement_day between 1 and 31),
  opening_used numeric(12, 2) not null default 0,
  alerted boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists xd_cards_name_idx on xd_cards (lower(name));
insert into xd_cards (name) values ('Sathish''s card'), ('Irfan''s card'), ('Ayoob''s card') on conflict do nothing;

create table if not exists xd_shipments (
  id bigint generated always as identity primary key,
  customer text not null,
  country text not null default '',
  invoice_no text not null default '',
  incoterm text not null default '',
  shipped_on date,
  notes text not null default '',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists xd_docs (
  id bigint generated always as identity primary key,
  shipment_id bigint not null references xd_shipments(id) on delete cascade,
  type_id bigint not null references xd_types(id),
  doc_number text not null default '',
  notes text not null default '',
  name text,
  mime text,
  size bigint,
  storage text,
  url text,
  pathname text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists xd_docs_shipment_idx on xd_docs (shipment_id);
create index if not exists xd_docs_number_idx on xd_docs (lower(doc_number));

-- Every movement on a card: money spent, or a top-up from Finance. A document's cost is one of these rows.
create table if not exists xd_txns (
  id bigint generated always as identity primary key,
  card_id bigint not null references xd_cards(id),
  kind text not null default 'spend' check (kind in ('spend', 'topup')),
  amount numeric(12, 2) not null check (amount > 0),
  on_date date not null default current_date,
  category_id bigint references xd_categories(id),
  description text not null default '',
  shipment_id bigint references xd_shipments(id) on delete set null,
  doc_id bigint unique references xd_docs(id) on delete cascade,
  charge_customer boolean not null default false,
  customer text not null default '',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists xd_txns_card_idx on xd_txns (card_id, on_date);
create index if not exists xd_txns_date_idx on xd_txns (on_date);

-- The balance the bank reports by SMS, typed in so it can be checked against the entries.
create table if not exists xd_balances (
  id bigint generated always as identity primary key,
  card_id bigint not null references xd_cards(id) on delete cascade,
  on_date date not null default current_date,
  balance numeric(12, 2) not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists xd_alerts (
  id bigint generated always as identity primary key,
  card_id bigint not null references xd_cards(id) on delete cascade,
  used numeric(12, 2) not null,
  credit_limit numeric(12, 2) not null,
  created_at timestamptz not null default now()
);
alter table push_state add column if not exists card_alert bigint not null default 0;
