-- Admin test area: sandbox vendors and requests that only the Admin sees.
alter table vendors add column test boolean not null default false;
alter table rfqs add column test boolean not null default false;
