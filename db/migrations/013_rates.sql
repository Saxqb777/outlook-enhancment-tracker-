-- Freight rate book: every quotation received, kept for search and comparison. History is never overwritten.
alter table users add column can_rates boolean not null default false;

create table rate_suppliers (
  id         bigint generated always as identity primary key,
  name       text not null,
  contact    text not null default '',
  email      text not null default '',
  phone      text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now()
);
create unique index rate_suppliers_name_key on rate_suppliers (lower(name));

-- One enquiry = one shipment requirement sent to several suppliers.
create table rate_requests (
  id                  bigint generated always as identity primary key,
  title               text not null,
  origin              text not null default '',
  origin_country      text not null default '',
  origin_port         text not null default '',
  destination         text not null default '',
  destination_country text not null default '',
  destination_port    text not null default '',
  commodity           text not null default '',
  mode                text not null default 'sea' check (mode in ('sea', 'road', 'air')),
  service             text not null default 'd2d' check (service in ('d2d', 'p2p', 'd2p', 'p2d')),
  incoterm            text not null default '',
  equipment           jsonb not null default '[]',
  notes               text not null default '',
  requested_on        date not null default current_date,
  status              text not null default 'open' check (status in ('open', 'awarded', 'closed')),
  awarded_quote_id    bigint,
  award_reason        text,
  pr_number           text,
  po_buffer_pct       numeric(5, 2) not null default 5,
  approval_id         bigint references approvals (id) on delete set null,
  created_by          uuid references users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One supplier's answer. A correction makes a new row and marks the old one as replaced, so nothing is lost.
create table rate_quotes (
  id             bigint generated always as identity primary key,
  request_id     bigint not null references rate_requests (id) on delete cascade,
  supplier_id    bigint not null references rate_suppliers (id),
  state          text not null default 'quoted' check (state in ('quoted', 'declined', 'no_reply')),
  quoted_on      date not null default current_date,
  currency       text not null default 'USD',
  rates          jsonb not null default '[]',
  charges        jsonb not null default '[]',
  carrier        text not null default '',
  routing        text not null default '',
  transit        text not null default '',
  free_time      text not null default '',
  valid_until    date,
  remarks        text not null default '',
  exclusions     text not null default '',
  decline_reason text not null default '',
  negotiated     boolean not null default false,
  replaces_id    bigint references rate_quotes (id) on delete set null,
  replaced_at    timestamptz,
  created_by     uuid references users (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index rate_quotes_request_idx on rate_quotes (request_id);
create index rate_quotes_supplier_idx on rate_quotes (supplier_id);

create table rate_files (
  id         bigint generated always as identity primary key,
  request_id bigint not null references rate_requests (id) on delete cascade,
  quote_id   bigint references rate_quotes (id) on delete cascade,
  name       text not null,
  mime       text not null,
  size       int not null,
  storage    text not null check (storage in ('blob', 'local')),
  url        text not null,
  pathname   text not null,
  created_at timestamptz not null default now()
);
create index rate_files_idx on rate_files (request_id);

-- Exchange rates (AED per one unit of each currency) and the suggested charge lines.
create table rate_settings (
  id      int primary key default 1 check (id = 1),
  fx      jsonb not null default '{"AED": 1, "USD": 3.685, "EUR": 4.0, "SAR": 0.98, "GBP": 4.65, "CNY": 0.51, "INR": 0.044}',
  charges jsonb not null default '[]'
);
insert into rate_settings (id, charges) values (1, '[
  ["Clearance and delivery charges", "shipment"], ["Logistics handling charges", "container"], ["Plug in charges", "container"],
  ["Exit submission - VAT reclaim", "shipment"], ["Conservancy fees", "container"], ["Additional handling fee", "container"],
  ["Bunker adjustment factor", "container"], ["Emergency fuel surcharge", "container"], ["Emergency conflict surcharge", "container"],
  ["Emergency operational recovery surcharge", "shipment"], ["Seaway BL issuance", "shipment"], ["Extra risk coverage surcharge", "container"],
  ["Origin export charges", "container"], ["Fumigation", "container"], ["ISPS", "container"], ["CRC (container release charges)", "container"],
  ["CPC", "container"], ["MOCCAE inspection at origin for phyto", "container"], ["Origin THC", "container"],
  ["TIF (terminal infrastructure fees)", "container"], ["TLUC", "container"], ["Document processing charges (DPC)", "shipment"],
  ["Transportation", "container"], ["E-token", "container"], ["Genset", "container"], ["VGM", "container"], ["Bill of lading fee", "shipment"],
  ["Seal charges", "container"], ["Admin cost", "shipment"], ["Clearance", "shipment"], ["Port storage charge", "container"],
  ["Phyto certificate - MOCCAE", "shipment"], ["ADAFSA", "shipment"], ["Chamber - COO", "shipment"], ["Destination THC", "container"],
  ["Delivery order fee", "shipment"], ["Customs duty handling", "shipment"], ["Demurrage / detention", "container"]
]');
