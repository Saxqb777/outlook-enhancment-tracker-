// Jobs: the milestones a won request goes through, for the team and for the vendor.
import type { PoolClient } from "pg";
import type { Verified } from "@/lib/attachments";
import { one, q, tx } from "@/lib/db";
import { isISODate } from "@/lib/time";
import { DEFAULT_MILESTONES, POD } from "@/lib/vendor-labels";

export type Result = { ok: true } | { ok: false; error: string };
/** Who is acting: a team person or a vendor person. `vendorScope` limits a vendor to jobs they won. */
export type Who = { userId: string | null; vendorUserId: string | null; name: string; vendorScope: string | null };
const GONE = { ok: false as const, error: "That isn't available any more." };
const isId = (v: unknown) => /^\d{1,12}$/.test(String(v));
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function cleanSteps(v: unknown): string[] {
  const out: string[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const t = text(x, 80).replace(/\s+/g, " ");
    if (t && t.toLowerCase() !== POD.toLowerCase() && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

/** Sets the job's milestones (when a vendor is chosen). Proof of delivery is always added last. */
export async function seedMilestones(c: PoolClient, rfqId: string, steps: string[] | null) {
  const have = await c.query("select 1 from job_milestones where rfq_id = $1 limit 1", [rfqId]);
  if (have.rowCount && !steps) return;
  await c.query("delete from job_milestones where rfq_id = $1 and done_at is null", [rfqId]);
  const list = [...(steps?.length ? steps : DEFAULT_MILESTONES), POD];
  let pos = ((await c.query<{ n: number }>("select coalesce(max(position), 0)::int as n from job_milestones where rfq_id = $1", [rfqId])).rows[0]?.n ?? 0) + 1;
  for (const title of list) await c.query("insert into job_milestones (rfq_id, position, title, needs_pod) values ($1, $2, $3, $4)", [rfqId, pos++, title, title === POD]);
}

type M = { id: string; rfq_id: string; position: number; title: string; needs_pod: boolean; done_at: Date | null; problem: string | null; status: string; awarded_vendor_id: string | null };
async function load(c: PoolClient, who: Who, mid: string): Promise<M | null> {
  if (!isId(mid)) return null;
  const m = (
    await c.query<M>(
      `select m.id::text as id, m.rfq_id::text as rfq_id, m.position, m.title, m.needs_pod, m.done_at, m.problem, r.status, r.awarded_vendor_id::text as awarded_vendor_id
         from job_milestones m join rfqs r on r.id = m.rfq_id where m.id = $1 for update of m`,
      [mid],
    )
  ).rows[0];
  if (!m || !m.awarded_vendor_id) return null;
  if (who.vendorScope && who.vendorScope !== m.awarded_vendor_id) return null;
  return m;
}
/** Every job update also lands in the chat with the vendor, so both sides get the pop-up and the story stays in one place. */
const tell = (c: PoolClient, m: M, who: Who, body: string, kind: "system" | "text" = "system") =>
  c.query("insert into rfq_messages (rfq_id, vendor_id, user_id, vendor_user_id, kind, body) values ($1, $2, $3, $4, $5, $6)", [m.rfq_id, m.awarded_vendor_id, who.userId, who.vendorUserId, kind, body]);
const running = (m: M): Result | null =>
  m.status === "confirmed" ? null : { ok: false, error: m.status === "awarded" ? "The vendor has to confirm the job first." : "This job is closed." };

export async function tickMilestone(who: Who, mid: string, note: string, files: Verified[]): Promise<Result & { rfqId?: string }> {
  return tx(async (c) => {
    const m = await load(c, who, mid);
    if (!m) return GONE;
    const no = running(m);
    if (no) return no;
    if (m.done_at) return { ok: false, error: "That milestone is already done." };
    // Milestones go in order: nothing can be ticked while an earlier one is still open.
    const earlier = (await c.query<{ title: string }>("select title from job_milestones where rfq_id = $1 and done_at is null and (position, id) < ($2, $3::bigint) order by position, id limit 1", [m.rfq_id, m.position, m.id])).rows[0];
    if (earlier) return { ok: false, error: `Do "${earlier.title}" first. Milestones are ticked in order.` };
    if (m.needs_pod && !files.length && !(await c.query("select 1 from rfq_files where milestone_id = $1 limit 1", [m.id])).rowCount)
      return { ok: false, error: "Attach the proof of delivery first (the signed delivery note or a photo of it)." };
    const why = text(note, 500) || null;
    await c.query("update job_milestones set done_at = now(), done_by = $2, done_note = $3, problem = null, problem_eta = null, problem_at = null where id = $1", [m.id, who.name, why]);
    for (const f of files)
      await c.query("insert into rfq_files (rfq_id, vendor_id, milestone_id, from_team, name, mime, size, storage, url, pathname) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", [m.rfq_id, m.awarded_vendor_id, m.id, !!who.userId, f.name, f.mime, f.size, f.storage, f.url, f.pathname]);
    await tell(c, m, who, `${who.name} marked "${m.title}" as done.${why ? ` Note: ${why}` : ""}${files.length ? ` (${files.length} file${files.length === 1 ? "" : "s"} attached)` : ""}`);
    await c.query("update rfqs set updated_at = now() where id = $1", [m.rfq_id]);
    return { ok: true, rfqId: m.rfq_id };
  });
}

export async function untickMilestone(who: Who, mid: string): Promise<Result & { rfqId?: string }> {
  return tx(async (c) => {
    const m = await load(c, who, mid);
    if (!m) return GONE;
    const no = running(m);
    if (no) return no;
    if (!m.done_at) return { ok: false, error: "That milestone isn't marked done." };
    // Only the last ticked milestone can be undone, so no gaps appear in the middle.
    const later = (await c.query<{ title: string }>("select title from job_milestones where rfq_id = $1 and done_at is not null and (position, id) > ($2, $3::bigint) order by position desc, id desc limit 1", [m.rfq_id, m.position, m.id])).rows[0];
    if (later) return { ok: false, error: `Undo "${later.title}" first. Only the last ticked milestone can be undone.` };
    await c.query("update job_milestones set done_at = null, done_by = null, done_note = null where id = $1", [m.id]);
    await tell(c, m, who, `${who.name} undid "${m.title}". It is not done yet.`);
    return { ok: true, rfqId: m.rfq_id };
  });
}

/** Feedback on one milestone, from either side. */
export async function commentMilestone(who: Who, mid: string, body: string): Promise<Result & { rfqId?: string }> {
  const msg = text(body, 1000);
  if (!msg) return { ok: false, error: "Write your comment first." };
  return tx(async (c) => {
    const m = await load(c, who, mid);
    if (!m) return GONE;
    if (m.status !== "confirmed" && m.status !== "awarded" && m.status !== "done") return GONE;
    await c.query("insert into job_comments (milestone_id, user_id, vendor_user_id, body) values ($1, $2, $3, $4)", [m.id, who.userId, who.vendorUserId, msg]);
    await tell(c, m, who, `On "${m.title}": ${msg}`, "text");
    return { ok: true, rfqId: m.rfq_id };
  });
}

export async function flagProblem(who: Who, mid: string, what: string, eta: string): Promise<Result & { rfqId?: string }> {
  const msg = text(what, 500);
  if (!msg) return { ok: false, error: "Say what the problem is." };
  return tx(async (c) => {
    const m = await load(c, who, mid);
    if (!m) return GONE;
    const no = running(m);
    if (no) return no;
    if (m.done_at) return { ok: false, error: "That milestone is already done." };
    const when = isISODate(eta) ? eta : null;
    await c.query("update job_milestones set problem = $2, problem_eta = $3, problem_at = now() where id = $1", [m.id, msg, when]);
    await tell(c, m, who, `Problem at "${m.title}": ${msg}${when ? ` New expected date: ${when}.` : ""}`);
    return { ok: true, rfqId: m.rfq_id };
  });
}

export async function resolveProblem(who: Who, mid: string): Promise<Result & { rfqId?: string }> {
  return tx(async (c) => {
    const m = await load(c, who, mid);
    if (!m || !m.problem) return GONE;
    await c.query("update job_milestones set problem = null, problem_eta = null, problem_at = null where id = $1", [m.id]);
    await tell(c, m, who, `${who.name} marked the problem at "${m.title}" as solved.`);
    return { ok: true, rfqId: m.rfq_id };
  });
}

/** Team only: add a milestone to a running job. It goes just before Proof of delivery. */
export async function addMilestone(who: Who, rfqId: string, title: string): Promise<Result> {
  const t = cleanSteps([title])[0];
  if (!t) return { ok: false, error: "Give the milestone a name." };
  return tx(async (c) => {
    const r = (await c.query<{ status: string; awarded_vendor_id: string | null }>("select status, awarded_vendor_id::text as awarded_vendor_id from rfqs where id = $1 for update", [rfqId])).rows[0];
    if (!r || !r.awarded_vendor_id || (r.status !== "awarded" && r.status !== "confirmed")) return { ok: false, error: "Milestones can only be changed while the job is running." };
    if ((await c.query("select 1 from job_milestones where rfq_id = $1 and lower(title) = lower($2)", [rfqId, t])).rowCount) return { ok: false, error: "That milestone is already on the list." };
    const pod = (await c.query<{ position: number }>("select position from job_milestones where rfq_id = $1 and needs_pod order by position limit 1", [rfqId])).rows[0];
    if (pod) {
      await c.query("update job_milestones set position = position + 1 where rfq_id = $1 and position >= $2", [rfqId, pod.position]);
      await c.query("insert into job_milestones (rfq_id, position, title) values ($1, $2, $3)", [rfqId, pod.position, t]);
    } else await c.query("insert into job_milestones (rfq_id, position, title) select $1, coalesce(max(position), 0) + 1, $2 from job_milestones where rfq_id = $1", [rfqId, t]);
    await c.query("insert into rfq_messages (rfq_id, vendor_id, user_id, kind, body) values ($1, $2, $3, 'system', $4)", [rfqId, r.awarded_vendor_id, who.userId, `${who.name} added the milestone "${t}".`]);
    return { ok: true };
  });
}

export async function removeMilestone(who: Who, mid: string): Promise<Result & { rfqId?: string }> {
  return tx(async (c) => {
    const m = await load(c, who, mid);
    if (!m) return GONE;
    if (m.status !== "awarded" && m.status !== "confirmed") return { ok: false, error: "Milestones can only be changed while the job is running." };
    if (m.needs_pod) return { ok: false, error: "Proof of delivery is always needed, so it can't be removed." };
    if (m.done_at) return { ok: false, error: "That milestone is already done. Undo it first." };
    await c.query("delete from job_milestones where id = $1", [m.id]);
    await tell(c, m, who, `${who.name} removed the milestone "${m.title}".`);
    return { ok: true, rfqId: m.rfq_id };
  });
}

// ------------------------------------------------------------------ loading

export type JobMilestone = {
  id: string; title: string; needs_pod: boolean; done_at: Date | null; done_by: string | null; done_note: string | null; problem: string | null; problem_eta: string | null;
  files: { id: string; name: string; mime: string; size: number }[];
  comments: { id: string; who: string; side: "team" | "vendor"; body: string; at: Date }[];
};

export async function getJob(rfqId: string): Promise<JobMilestone[]> {
  if (!isId(rfqId)) return [];
  const [ms, files, comments] = await Promise.all([
    q<Omit<JobMilestone, "files" | "comments">>("select id::text as id, title, needs_pod, done_at, done_by, done_note, problem, problem_eta::text as problem_eta from job_milestones where rfq_id = $1 order by position, id", [rfqId]),
    q<{ id: string; milestone_id: string; name: string; mime: string; size: number }>("select id::text as id, milestone_id::text as milestone_id, name, mime, size from rfq_files where rfq_id = $1 and milestone_id is not null order by id", [rfqId]),
    q<{ id: string; milestone_id: string; who: string; side: "team" | "vendor"; body: string; at: Date }>(
      `select c.id::text as id, c.milestone_id::text as milestone_id, coalesce(u.name, vu.name, 'Someone') as who, case when c.vendor_user_id is not null then 'vendor' else 'team' end as side, c.body, c.created_at as at
         from job_comments c join job_milestones m on m.id = c.milestone_id left join users u on u.id = c.user_id left join vendor_users vu on vu.id = c.vendor_user_id where m.rfq_id = $1 order by c.id`,
      [rfqId],
    ),
  ]);
  return ms.map((m) => ({ ...m, files: files.filter((f) => f.milestone_id === m.id), comments: comments.filter((x) => x.milestone_id === m.id) }));
}

export const rfqOfMilestone = async (mid: string) => (isId(mid) ? ((await one<{ id: string }>("select rfq_id::text as id from job_milestones where id = $1", [mid]))?.id ?? "") : "");
export type StepTemplate = { id: string; name: string; steps: string[] };
export const listStepTemplates = () => q<StepTemplate>("select id::text as id, name, steps from milestone_templates order by lower(name)");
