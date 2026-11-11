"use server";

import { revalidatePath } from "next/cache";
import { requireUser, type User } from "@/lib/auth";
import { one, q, tx } from "@/lib/db";
import { isPriority } from "@/lib/status";

type Result = { ok: true } | { ok: false; error: string };
const VIEW_ONLY = { ok: false as const, error: "Admin is view only, so nothing can be changed from this account." };
const GONE = { ok: false as const, error: "That case isn't available." };
const isId = (v: unknown) => /^\d{1,12}$/.test(String(v));
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/.test(String(v));

function touch(caseId?: string) {
  for (const p of ["/", "/cases", "/board", "/dashboard", "/admin"]) revalidatePath(p);
  if (caseId) revalidatePath(`/cases/${caseId}`);
}

type Ctx = { id: string; owner_id: string; owner_name: string };
async function caseFor(me: User, caseId: string): Promise<Ctx | null> {
  if (!isId(caseId)) return null;
  return one<Ctx>(
    `select c.id::text as id, c.owner_id, u.name as owner_name from cases c join users u on u.id = c.owner_id
      where c.id = $1 and ($2::uuid is null or c.owner_id = $2 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $2))`,
    [caseId, me.role === "member" ? me.id : null],
  );
}
const say = (t: { query: (s: string, p: unknown[]) => Promise<unknown> }, caseId: string, userId: string, body: string) =>
  t.query("insert into case_messages (case_id, user_id, kind, body) values ($1, $2, 'system', $3)", [caseId, userId, body]);

/** Title, summary, company and priority. A Lead or the case owner can edit. */
export async function updateCase(caseId: string, input: { subject: string; summary: string; company: string; priority: string }): Promise<Result> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const c = await caseFor(me, caseId);
  if (!c) return GONE;
  if (me.role !== "lead" && c.owner_id !== me.id) return { ok: false, error: "Only a Lead or the case owner can edit the details." };
  const subject = String(input?.subject ?? "").trim().slice(0, 200);
  if (!subject) return { ok: false, error: "The title can't be empty." };
  await q("update cases set subject = $1, summary = $2, company = $3, priority = $4, updated_at = now() where id = $5", [
    subject,
    String(input.summary ?? "").trim().slice(0, 800),
    String(input.company ?? "").trim().slice(0, 120),
    isPriority(input.priority) ? input.priority : "normal",
    c.id,
  ]);
  touch(c.id);
  return { ok: true };
}

async function handOver(me: User, c: Ctx, toId: string, keepOld: boolean, note: string) {
  const to = await one<{ id: string; name: string }>("select id, name from users where id = $1 and status = 'active' and role <> 'admin'", [toId]);
  if (!to) return { ok: false as const, error: "Pick someone on the team." };
  if (to.id === c.owner_id) return { ok: true as const };
  await tx(async (t) => {
    await t.query("update cases set owner_id = $1, updated_at = now() where id = $2", [to.id, c.id]);
    await t.query("delete from case_members where case_id = $1 and user_id = $2", [c.id, to.id]);
    if (keepOld) {
      await t.query("insert into case_members (case_id, user_id, added_by) values ($1, $2, $3) on conflict do nothing", [c.id, c.owner_id, me.id]);
    } else {
      await t.query("update points set assignee_id = null where case_id = $1 and assignee_id = $2", [c.id, c.owner_id]);
    }
    await say(t, c.id, me.id, `handed this case from ${c.owner_name} to ${to.name}${note ? `: ${note}` : ""}`);
  });
  return { ok: true as const };
}

/** Hand a case to a new owner. A Lead can do this on any case; an owner can hand over their own. */
export async function setCaseOwner(caseId: string, toId: string, keepOld: boolean, note?: string): Promise<Result> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const c = await caseFor(me, caseId);
  if (!c || !isUuid(toId)) return GONE;
  if (me.role !== "lead" && c.owner_id !== me.id) return { ok: false, error: "Only a Lead or the case owner can hand a case over." };
  const r = await handOver(me, c, toId, keepOld, String(note ?? "").trim().slice(0, 300));
  touch(c.id);
  return r;
}

/** Leads: hand several cases to one person (for example when someone is on leave). */
export async function bulkSetOwner(caseIds: string[], toId: string): Promise<{ ok: true; moved: number } | { ok: false; error: string }> {
  const me = await requireUser();
  if (me.role !== "lead") return { ok: false, error: "Only a Lead can move several cases at once." };
  if (!isUuid(toId)) return { ok: false, error: "Pick someone on the team." };
  const ids = (Array.isArray(caseIds) ? caseIds : []).map(String).filter(isId).slice(0, 200);
  let moved = 0;
  for (const id of ids) {
    const c = await caseFor(me, id);
    if (!c || c.owner_id === toId) continue;
    const r = await handOver(me, c, toId, false, "");
    if (!r.ok) return r;
    moved++;
  }
  touch();
  return { ok: true, moved };
}

/** Who is doing a point. Must be someone on the case; null clears it. */
export async function setPointAssignee(pointId: string, userId: string | null): Promise<Result> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  if (!isId(pointId)) return GONE;
  const p = await one<{ id: string; case_id: string }>(
    `select p.id::text as id, p.case_id::text as case_id from points p join cases c on c.id = p.case_id
      where p.id = $1 and ($2::uuid is null or c.owner_id = $2 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $2))`,
    [pointId, me.role === "member" ? me.id : null],
  );
  if (!p) return { ok: false, error: "That point isn't available." };
  if (userId !== null) {
    const on = isUuid(userId)
      ? await one(
          `select 1 from cases c where c.id = $1 and (c.owner_id = $2 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $2))`,
          [p.case_id, userId],
        )
      : null;
    if (!on) return { ok: false, error: "Pick someone who is on this case." };
  }
  await q("update points set assignee_id = $1, updated_at = now() where id = $2", [userId, p.id]);
  touch(p.case_id);
  return { ok: true };
}
