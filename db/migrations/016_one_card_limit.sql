-- Card expenses: one limit for all the cards together. Each expense only says which card paid.
create table if not exists xd_budget (
  id int primary key check (id = 1),
  credit_limit numeric(12, 2) not null default 25000,
  alert_at numeric(12, 2) not null default 20000,
  statement_day int not null default 18 check (statement_day between 1 and 31),
  opening_used numeric(12, 2) not null default 0,
  alerted boolean not null default false
);
insert into xd_budget (id) values (1) on conflict do nothing;
alter table xd_alerts alter column card_id drop not null;
alter table xd_balances alter column card_id drop not null;
