-- Jobs: after a vendor is awarded and confirms, the request is tracked through milestones until it is closed.
create table job_milestones (
  id             bigint generated always as identity primary key,
  rfq_id         bigint not null references rfqs (id) on delete cascade,
  position       int not null,
  title          text not null,
  needs_pod      boolean not null default false,
  done_at        timestamptz,
  done_by        text,
  done_note      text,
  problem        text,
  problem_eta    date,
  problem_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index job_milestones_idx on job_milestones (rfq_id, position);

-- Comments (feedback) on a milestone, from the team or the vendor.
create table job_comments (
  id             bigint generated always as identity primary key,
  milestone_id   bigint not null references job_milestones (id) on delete cascade,
  user_id        uuid references users (id) on delete set null,
  vendor_user_id uuid references vendor_users (id) on delete set null,
  body           text not null,
  created_at     timestamptz not null default now()
);
create index job_comments_idx on job_comments (milestone_id, id);

-- Saved milestone lists the team reuses.
create table milestone_templates (
  id         bigint generated always as identity primary key,
  name       text not null,
  steps      jsonb not null,
  created_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index milestone_templates_name_key on milestone_templates (lower(name));

alter table rfq_files add column milestone_id bigint references job_milestones (id) on delete set null;
alter table rfq_files add column from_team boolean not null default false;
alter table rfqs add column job_due date;
alter table rfqs add column rating int check (rating between 1 and 5);
alter table rfqs add column final_cost numeric(14, 2);
alter table rfqs add column close_note text;
