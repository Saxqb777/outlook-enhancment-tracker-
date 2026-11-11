// Numbers for the Lead dashboard. A point belongs to its assignee, or to the case owner when nobody is assigned.
import { q } from "@/lib/db";
import type { Status } from "@/lib/status";
import { TZ } from "@/lib/time";

export type DashPoint = {
  id: string;
  case_id: string;
  text: string;
  subject: string;
  company: string;
  case_added: Date;
  status: Status;
  due: string | null;
  wait_reason: string | null;
  person_id: string;
  person: string;
  status_at: Date | null;
  last_at: Date | null;
  last_update: string | null;
};
export type DashPerson = { id: string; name: string; role: "lead" | "member"; last_login_at: Date | null; cases: number };
export type DashWeek = { week: string; added: number; done: number; approved: number };
export type DashDone = { person_id: string; on_time: boolean | null; days: number };
export type DashCase = { id: string; subject: string; owner: string; open: number; last_at: Date };

export async function dashboardData(today: string) {
  const [points, people, weeks, done, quiet] = await Promise.all([
    q<DashPoint>(
      `select p.id::text as id, p.case_id::text as case_id, p.text, c.subject, c.company, c.created_at as case_added, p.status, p.due::text as due, p.wait_reason,
              coalesce(p.assignee_id, c.owner_id) as person_id, coalesce(a.name, o.name) as person,
              (select max(e.created_at) from point_events e where e.point_id = p.id and e.kind in ('status', 'reopen')) as status_at,
              (select max(e.created_at) from point_events e where e.point_id = p.id) as last_at,
              (select e.text from point_events e where e.point_id = p.id and e.kind = 'update' and e.text is not null order by e.created_at desc limit 1) as last_update
         from points p join cases c on c.id = p.case_id join users o on o.id = c.owner_id left join users a on a.id = p.assignee_id`,
    ),
    q<DashPerson>(
      `select u.id, u.name, u.role, u.last_login_at,
              (select count(*)::int from cases c where c.owner_id = u.id or exists (select 1 from case_members m where m.case_id = c.id and m.user_id = u.id)) as cases
         from users u where u.status = 'active' and u.role <> 'admin' order by lower(u.name)`,
    ),
    q<DashWeek>(
      `with w as (select generate_series(date_trunc('week', $1::date) - interval '7 weeks', date_trunc('week', $1::date), interval '1 week')::date as week)
       select w.week::text as week,
              (select count(*)::int from points p where (p.created_at at time zone $2)::date >= w.week and (p.created_at at time zone $2)::date < w.week + 7) as added,
              (select count(*)::int from point_events e where e.kind = 'status' and e.status = 'done' and (e.created_at at time zone $2)::date >= w.week and (e.created_at at time zone $2)::date < w.week + 7) as done,
              (select count(*)::int from point_events e where e.kind = 'status' and e.status = 'approved' and (e.created_at at time zone $2)::date >= w.week and (e.created_at at time zone $2)::date < w.week + 7) as approved
         from w order by w.week`,
      [today, TZ],
    ),
    q<DashDone>(
      `select coalesce(p.assignee_id, c.owner_id) as person_id,
              case when p.due is null then null else (d.at at time zone $2)::date <= p.due end as on_time,
              greatest(0, extract(epoch from d.at - p.created_at) / 86400)::float as days
         from points p join cases c on c.id = p.case_id
         join lateral (select max(e.created_at) as at from point_events e where e.point_id = p.id and e.kind = 'status' and e.status = 'done') d on d.at is not null
        where p.status in ('done', 'approved') and d.at > $1::date - interval '30 days'`,
      [today, TZ],
    ),
    q<DashCase>(
      `select c.id::text as id, c.subject, o.name as owner,
              (select count(*)::int from points p where p.case_id = c.id and p.status not in ('done', 'approved')) as open,
              greatest(c.updated_at, coalesce((select max(m.created_at) from case_messages m where m.case_id = c.id), c.updated_at)) as last_at
         from cases c join users o on o.id = c.owner_id
        where exists (select 1 from points p where p.case_id = c.id and p.status not in ('done', 'approved'))
        order by 5 asc limit 6`,
    ),
  ]);
  return { points, people, weeks, done, quiet };
}
