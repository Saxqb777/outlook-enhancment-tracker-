"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, type User } from "@/lib/auth";
import { one, q, tx } from "@/lib/db";
import { MAX_EMAIL_CHARS, splitEmail } from "@/lib/email";
import { extractEmail, type Extraction } from "@/lib/extract";
import { isPriority, isStatus, statusBlocked, type Status } from "@/lib/status";
import { isISODate, todayISO } from "@/lib/time";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_EMAIL = MAX_EMAIL_CHARS;

function touch(caseId?: string) {
  revalidatePath("/");
  revalidatePath("/cases");
  revalidatePath("/board");
  if (caseId) revalidatePath(`/cases/${caseId}`);
}

// ------------------------------------------------------------------ reading an email

export async function readEmail(raw: string): Promise<{ ok: true; data: Extraction } | { ok: false; error: string }> {
  await requireUser();
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, error: "Paste the email first." };
  if (text.length > MAX_EMAIL) return { ok: false, error: "This thread is too long to read in one go. Remove the oldest replies at the bottom and try again." };
  return extractEmail(text, todayISO());
}

export type NewCase = {
  raw: string;
  source: "paste" | "file";
  fileName?: string;
  subject: string;
  summary: string;
  fromName: string;
  fromEmail: string;
  company: string;
  priority: string;
  deadline: string;
  ownerId: string;
  details: { label: string; value: string }[];
  points: { text: string; due: string; quote: string }[];
};

export async function createCase(input: NewCase): Promise<ActionResult> {
  const me = await requireUser();
  const raw = String(input?.raw ?? "").trim();
  if (!raw || raw.length > MAX_EMAIL) return { ok: false, error: "The email text is missing or too long." };
  const subject = String(input.subject ?? "").trim().slice(0, 200);
  if (!subject) return { ok: false, error: "Add a title before creating the case." };
  const points = (Array.isArray(input.points) ? input.points : [])
    .map((p) => ({ text: String(p?.text ?? "").trim().slice(0, 300), due: isISODate(p?.due) ? p.due : null, quote: String(p?.quote ?? "").trim().slice(0, 1200) || null }))
    .filter((p) => p.text)
    .slice(0, 30);
  if (!points.length) return { ok: false, error: "Add at least one point. Each point is one thing to get done." };

  let ownerId = me.id;
  if (me.role === "lead" && input.ownerId && input.ownerId !== me.id) {
    const owner = await one<{ id: string }>("select id from users where id = $1 and status = 'active'", [input.ownerId]);
    if (!owner) return { ok: false, error: "That owner can't take cases. Pick someone on the team." };
    ownerId = owner.id;
  }

  const mail = splitEmail(raw);
  const details = (Array.isArray(input.details) ? input.details : [])
    .map((d) => ({ label: String(d?.label ?? "").trim().slice(0, 60), value: String(d?.value ?? "").trim().slice(0, 200) }))
    .filter((d) => d.label && d.value)
    .slice(0, 12);
  const deadline = isISODate(input.deadline) ? input.deadline : points.map((p) => p.due).filter(Boolean).sort()[0] ?? null;

  const caseId = await tx(async (c) => {
    const res = await c.query<{ id: string }>(
      `insert into cases (owner_id, created_by, subject, summary, from_name, from_email, company, priority, deadline,
                          email_to, email_sent, email_body, source, file_name, details)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb) returning id::text as id`,
      [
        ownerId,
        me.id,
        subject,
        String(input.summary ?? "").trim().slice(0, 800),
        String(input.fromName ?? "").trim().slice(0, 120),
        String(input.fromEmail ?? "").trim().slice(0, 200),
        String(input.company ?? "").trim().slice(0, 120),
        isPriority(input.priority) ? input.priority : "normal",
        deadline,
        mail.to.slice(0, 300),
        mail.sent.slice(0, 120),
        mail.body || raw,
        input.source === "file" ? "file" : "paste",
        input.source === "file" ? String(input.fileName ?? "").slice(0, 200) || null : null,
        JSON.stringify(details),
      ],
    );
    const id = res.rows[0].id;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const pr = await c.query<{ id: string }>(
        "insert into points (case_id, position, text, source_quote, due) values ($1, $2, $3, $4, $5) returning id::text as id",
        [id, i + 1, p.text, p.quote, p.due],
      );
      await c.query("insert into point_events (point_id, user_id, kind) values ($1, $2, 'created')", [pr.rows[0].id, me.id]);
    }
    return id;
  });

  touch(caseId);
  redirect(`/cases/${caseId}`);
}

// ------------------------------------------------------------------ working on points

type PointCtx = { id: string; case_id: string; status: Status; owner_id: string };

async function pointFor(me: User, pointId: string): Promise<PointCtx | null> {
  if (!/^\d{1,12}$/.test(String(pointId))) return null;
  return one<PointCtx>(
    `select p.id::text as id, p.case_id::text as case_id, p.status, c.owner_id
       from points p join cases c on c.id = p.case_id
      where p.id = $1 and ($2::uuid is null or c.owner_id = $2)`,
    [pointId, me.role === "lead" ? null : me.id],
  );
}

export async function setPointStatus(pointId: string, status: string, reason?: string): Promise<ActionResult> {
  const me = await requireUser();
  if (!isStatus(status)) return { ok: false, error: "That status doesn't exist." };
  const p = await pointFor(me, pointId);
  if (!p) return { ok: false, error: "That point isn't available." };
  const blocked = statusBlocked(me.role, p.status, status);
  if (blocked) return { ok: false, error: blocked };
  const why = status === "wait" ? String(reason ?? "").trim().slice(0, 200) : "";
  if (status === "wait" && !why) return { ok: false, error: "Say what it's waiting on." };
  if (p.status === status && status !== "wait") return { ok: true };
  await tx(async (c) => {
    await c.query("update points set status = $1, wait_reason = $2, updated_at = now() where id = $3", [status, why || null, p.id]);
    await c.query("insert into point_events (point_id, user_id, kind, status, text) values ($1, $2, 'status', $3, $4)", [p.id, me.id, status, why || null]);
    await c.query("update cases set updated_at = now() where id = $1", [p.case_id]);
  });
  touch(p.case_id);
  return { ok: true };
}

export async function reopenPoint(pointId: string): Promise<ActionResult> {
  const me = await requireUser();
  if (me.role !== "lead") return { ok: false, error: "Only the Lead can reopen points." };
  const p = await pointFor(me, pointId);
  if (!p) return { ok: false, error: "That point isn't available." };
  await tx(async (c) => {
    await c.query("update points set status = 'progress', wait_reason = null, updated_at = now() where id = $1", [p.id]);
    await c.query("insert into point_events (point_id, user_id, kind, status) values ($1, $2, 'reopen', 'progress')", [p.id, me.id]);
  });
  touch(p.case_id);
  return { ok: true };
}

export async function setPointDue(pointId: string, due: string | null): Promise<ActionResult> {
  const me = await requireUser();
  const p = await pointFor(me, pointId);
  if (!p) return { ok: false, error: "That point isn't available." };
  const d = due && isISODate(due) ? due : null;
  await tx(async (c) => {
    await c.query("update points set due = $1, updated_at = now() where id = $2", [d, p.id]);
    await c.query("insert into point_events (point_id, user_id, kind, due) values ($1, $2, 'due', $3)", [p.id, me.id, d]);
  });
  touch(p.case_id);
  return { ok: true };
}

export async function setCaseDeadline(caseId: string, due: string | null): Promise<ActionResult> {
  const me = await requireUser();
  if (!/^\d{1,12}$/.test(String(caseId))) return { ok: false, error: "That case isn't available." };
  const d = due && isISODate(due) ? due : null;
  const rows = await q("update cases set deadline = $1, updated_at = now() where id = $2 and ($3::uuid is null or owner_id = $3) returning id", [
    d,
    caseId,
    me.role === "lead" ? null : me.id,
  ]);
  if (!rows.length) return { ok: false, error: "That case isn't available." };
  touch(caseId);
  return { ok: true };
}

export async function postNote(pointId: string, text: string): Promise<ActionResult> {
  const me = await requireUser();
  const body = String(text ?? "").trim().slice(0, 2000);
  if (!body) return { ok: false, error: me.role === "lead" ? "Write the remark first." : "Write the update first." };
  const p = await pointFor(me, pointId);
  if (!p) return { ok: false, error: "That point isn't available." };
  await q("insert into point_events (point_id, user_id, kind, text) values ($1, $2, $3, $4)", [p.id, me.id, me.role === "lead" ? "remark" : "update", body]);
  touch(p.case_id);
  return { ok: true };
}

export async function addPoint(caseId: string, text: string, due: string | null): Promise<ActionResult> {
  const me = await requireUser();
  const body = String(text ?? "").trim().slice(0, 300);
  if (!body) return { ok: false, error: "Say what needs to be done." };
  if (!/^\d{1,12}$/.test(String(caseId))) return { ok: false, error: "That case isn't available." };
  const c = await one<{ id: string }>("select id::text as id from cases where id = $1 and ($2::uuid is null or owner_id = $2)", [
    caseId,
    me.role === "lead" ? null : me.id,
  ]);
  if (!c) return { ok: false, error: "That case isn't available." };
  await tx(async (t) => {
    const pos = await t.query<{ n: number }>("select coalesce(max(position), 0)::int + 1 as n from points where case_id = $1", [c.id]);
    const pr = await t.query<{ id: string }>("insert into points (case_id, position, text, due) values ($1, $2, $3, $4) returning id::text as id", [
      c.id,
      pos.rows[0].n,
      body,
      due && isISODate(due) ? due : null,
    ]);
    await t.query("insert into point_events (point_id, user_id, kind) values ($1, $2, 'created')", [pr.rows[0].id, me.id]);
  });
  touch(c.id);
  return { ok: true };
}
