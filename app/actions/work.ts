"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import type { Uploaded } from "@/lib/attach-rules";
import { verifyUploads, type Verified } from "@/lib/attachments";
import { requireUser, type User } from "@/lib/auth";
import { one, q, tx } from "@/lib/db";
import { MAX_EMAIL_CHARS, parseAddress, splitEmail } from "@/lib/email";
import { extractEmail, extractReply, type Extraction } from "@/lib/extract";
import { isPriority, isStatus, statusBlocked, STATUS_LABEL, type Status } from "@/lib/status";
import { isISODate, todayISO } from "@/lib/time";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_EMAIL = MAX_EMAIL_CHARS;
/** Original files up to this size are kept so people can open the real email. */
const MAX_FILE = 2_500_000;
const VIEW_ONLY = { ok: false as const, error: "Admin is view only, so nothing can be changed from this account." };
const TOO_LONG = "This thread is too long to read in one go. Remove the oldest replies at the bottom and try again.";

function touch(caseId?: string) {
  revalidatePath("/");
  revalidatePath("/cases");
  revalidatePath("/board");
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  if (caseId) revalidatePath(`/cases/${caseId}`);
}

/** Stops runaway AI use: 40 reads per person per hour. */
async function overLimit(userId: string): Promise<boolean> {
  const r = await one<{ n: number }>("select count(*)::int as n from ai_reads where user_id = $1 and created_at > now() - interval '1 hour'", [userId]);
  return (r?.n ?? 0) >= 40;
}
const SLOW_DOWN = { ok: false as const, error: "That's a lot of emails in one hour. Wait a little, then try again." };

async function logRead(userId: string, kind: "new" | "reply", started: number, chars: number, r: { ok: boolean; error?: string }, points: number | null) {
  try {
    await q("insert into ai_reads (user_id, kind, ok, ms, chars, points, error) values ($1, $2, $3, $4, $5, $6, $7)", [
      userId,
      kind,
      r.ok,
      Date.now() - started,
      chars,
      r.ok ? points : null,
      r.ok ? null : (r.error ?? "Unknown error").slice(0, 300),
    ]);
  } catch (err) {
    console.error("ai_reads log failed", err);
  }
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
  txt: "text/plain; charset=utf-8",
  htm: "text/plain; charset=utf-8",
  html: "text/plain; charset=utf-8",
};

async function fileFrom(fd: FormData | null | undefined): Promise<{ name: string; mime: string; size: number; data: Buffer } | null> {
  const f = fd?.get("file");
  if (!f || typeof f === "string" || f.size === 0 || f.size > MAX_FILE) return null;
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  const mime = MIME[ext];
  if (!mime) return null;
  return { name: f.name.slice(0, 200), mime, size: f.size, data: Buffer.from(await f.arrayBuffer()) };
}

// ------------------------------------------------------------------ reading an email

export async function readEmail(raw: string): Promise<{ ok: true; data: Extraction } | { ok: false; error: string }> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, error: "Paste the email first." };
  if (text.length > MAX_EMAIL) return { ok: false, error: TOO_LONG };
  if (await overLimit(me.id)) return SLOW_DOWN;
  const started = Date.now();
  let r: Awaited<ReturnType<typeof extractEmail>>;
  try {
    r = await extractEmail(text, todayISO());
  } catch (err) {
    console.error("readEmail", err);
    r = { ok: false, error: "Something went wrong while reading. Try again." };
  }
  await logRead(me.id, "new", started, text.length, r, r.ok ? r.data.points.length : null);
  return r;
}

export type CaseMatch = { id: string; subject: string; reason: string };

const normSubject = (s: string) =>
  s
    .toLowerCase()
    .replace(/^\s*((re|fw|fwd|aw|wg)\s*:\s*)+/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const refsIn = (s: string) => new Set((s.toUpperCase().match(/\b[A-Z]{2,6}[-/]?\d{4,}(?:[-/][A-Z0-9]+)*\b/g) ?? []).map((x) => x.replace(/[-/]/g, "")));

/** Open cases that this email looks like a reply to: same subject, or a shared booking / B/L / container number. */
export async function matchCases(raw: string): Promise<CaseMatch[]> {
  const me = await requireUser();
  if (me.role === "admin") return [];
  const text = String(raw ?? "").slice(0, MAX_EMAIL);
  const mail = splitEmail(text);
  const subj = normSubject(mail.subject);
  const refs = refsIn(`${mail.subject}\n${text.slice(0, 6000)}`);
  if (!subj && !refs.size) return [];
  const rows = await q<{ id: string; subject: string; subjects: string; details: string; body: string }>(
    `select c.id::text as id, c.subject, c.details::text as details,
            coalesce((select string_agg(e.subject, ' | ') from case_emails e where e.case_id = c.id), '') as subjects,
            left(coalesce((select e.body from case_emails e where e.case_id = c.id and e.position = 0), ''), 4000) as body
       from cases c
      where ($1::uuid is null or c.owner_id = $1 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $1))
        and exists (select 1 from points p where p.case_id = c.id and p.status <> 'approved')
      order by c.updated_at desc limit 300`,
    [me.role === "member" ? me.id : null],
  );
  const out: (CaseMatch & { score: number })[] = [];
  for (const c of rows) {
    const subjects = [c.subject, ...c.subjects.split(" | ")].map(normSubject).filter((x) => x.length >= 8);
    if (subj.length >= 8 && subjects.some((x) => x === subj || (subj.length >= 16 && (x.includes(subj) || subj.includes(x))))) {
      out.push({ id: c.id, subject: c.subject, reason: "Same subject", score: 2 });
      continue;
    }
    const theirs = refsIn(`${c.subject} ${c.subjects} ${c.details} ${c.body}`);
    const shared = [...refs].find((r) => theirs.has(r));
    if (shared) out.push({ id: c.id, subject: c.subject, reason: "Same reference number", score: 1 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3).map(({ id, subject, reason }) => ({ id, subject, reason }));
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
  /** Other people working on this case with the owner. */
  shareWith?: string[];
};

/** Active Leads and Members from `ids`, minus the owner. Used for shared cases. */
async function teammates(ids: unknown, ownerId: string): Promise<string[]> {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x) && x !== ownerId).slice(0, 12);
  if (!list.length) return [];
  const rows = await q<{ id: string }>("select id from users where id = any($1::uuid[]) and status = 'active' and role <> 'admin'", [list]);
  return rows.map((r) => r.id);
}

export async function createCase(input: NewCase, files?: FormData): Promise<ActionResult> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
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
    const owner = await one<{ id: string }>("select id from users where id = $1 and status = 'active' and role <> 'admin'", [input.ownerId]);
    if (!owner) return { ok: false, error: "That owner can't take cases. Pick someone on the team." };
    ownerId = owner.id;
  }

  const mail = splitEmail(raw);
  const shared = await teammates(input.shareWith, ownerId);
  const file = input.source === "file" ? await fileFrom(files) : null;
  const details = (Array.isArray(input.details) ? input.details : [])
    .map((d) => ({ label: String(d?.label ?? "").trim().slice(0, 60), value: String(d?.value ?? "").trim().slice(0, 200) }))
    .filter((d) => d.label && d.value)
    .slice(0, 12);
  const deadline = isISODate(input.deadline) ? input.deadline : points.map((p) => p.due).filter(Boolean).sort()[0] ?? null;
  const fromName = String(input.fromName ?? "").trim().slice(0, 120);
  const fromEmail = String(input.fromEmail ?? "").trim().slice(0, 200);
  const source = input.source === "file" ? "file" : "paste";
  const fileName = source === "file" ? String(input.fileName ?? "").slice(0, 200) || null : null;

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
        fromName,
        fromEmail,
        String(input.company ?? "").trim().slice(0, 120),
        isPriority(input.priority) ? input.priority : "normal",
        deadline,
        mail.to.slice(0, 300),
        mail.sent.slice(0, 120),
        mail.body || raw,
        source,
        fileName,
        JSON.stringify(details),
      ],
    );
    const id = res.rows[0].id;
    const em = await c.query<{ id: string }>(
      `insert into case_emails (case_id, position, from_name, from_email, email_to, email_sent, subject, body, source, file_name, added_by)
       values ($1, 0, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id::text as id`,
      [id, fromName, fromEmail, mail.to.slice(0, 300), mail.sent.slice(0, 120), (mail.subject || subject).slice(0, 300), mail.body || raw, source, fileName, me.id],
    );
    const emailId = em.rows[0].id;
    if (file) {
      await c.query("insert into email_files (email_id, name, mime, size, data) values ($1, $2, $3, $4, $5)", [emailId, file.name, file.mime, file.size, file.data]);
    }
    for (const uid of shared) {
      await c.query("insert into case_members (case_id, user_id, added_by) values ($1, $2, $3) on conflict do nothing", [id, uid, me.id]);
    }
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const pr = await c.query<{ id: string }>(
        "insert into points (case_id, email_id, position, text, source_quote, due) values ($1, $2, $3, $4, $5, $6) returning id::text as id",
        [id, p.quote ? emailId : null, i + 1, p.text, p.quote, p.due],
      );
      await c.query("insert into point_events (point_id, user_id, kind, email_id) values ($1, $2, 'created', $3)", [pr.rows[0].id, me.id, emailId]);
    }
    return id;
  });

  touch(caseId);
  redirect(`/cases/${caseId}`);
}

// ------------------------------------------------------------------ replies on an existing case

type CaseCtx = { id: string; subject: string; summary: string; deadline: string | null };

async function caseFor(me: User, caseId: string): Promise<CaseCtx | null> {
  if (!/^\d{1,12}$/.test(String(caseId))) return null;
  return one<CaseCtx>(
    "select id::text as id, subject, summary, deadline::text as deadline from cases where id = $1 and ($2::uuid is null or owner_id = $2 or exists (select 1 from case_members cm where cm.case_id = cases.id and cm.user_id = $2))",
    [caseId, me.role === "member" ? me.id : null],
  );
}

export type ReplyChangeView = {
  pointId: string;
  number: number;
  text: string;
  status: Status;
  currentDue: string | null;
  due: string;
  done: boolean;
  note: string;
  quote: string;
};
export type ReplyView = {
  senderName: string;
  senderEmail: string;
  summary: string;
  nothingNew: boolean;
  newPoints: { text: string; due: string; quote: string }[];
  changes: ReplyChangeView[];
};

export async function readReply(caseId: string, raw: string): Promise<{ ok: true; data: ReplyView } | { ok: false; error: string }> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const c = await caseFor(me, caseId);
  if (!c) return { ok: false, error: "That case isn't available." };
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, error: "Paste the reply first." };
  if (text.length > MAX_EMAIL) return { ok: false, error: TOO_LONG };
  const points = await q<{ id: string; text: string; status: Status; due: string | null }>(
    "select id::text as id, text, status, due::text as due from points where case_id = $1 order by position, id",
    [c.id],
  );
  const last = await one<{ body: string; email_sent: string; from_name: string }>(
    "select body, email_sent, from_name from case_emails where case_id = $1 order by position desc limit 1",
    [c.id],
  );
  if (await overLimit(me.id)) return SLOW_DOWN;
  const started = Date.now();
  let r: Awaited<ReturnType<typeof extractReply>>;
  try {
    r = await extractReply(
      text,
      {
        subject: c.subject,
        summary: c.summary,
        points: points.map((p) => ({ text: p.text, status: STATUS_LABEL[p.status], due: p.due })),
        lastEmail: last ? `From: ${last.from_name}\nSent: ${last.email_sent}\n\n${last.body}` : "",
      },
      todayISO(),
    );
  } catch (err) {
    console.error("readReply", err);
    r = { ok: false, error: "Something went wrong while reading. Try again." };
  }
  await logRead(me.id, "reply", started, text.length, r, r.ok ? r.data.newPoints.length + r.data.changes.length : null);
  if (!r.ok) return r;
  const merged = new Map<number, ReplyChangeView>();
  for (const ch of r.data.changes) {
    const p = points[ch.point - 1];
    const prev = merged.get(ch.point);
    merged.set(ch.point, {
      pointId: p.id,
      number: ch.point,
      text: p.text,
      status: p.status,
      currentDue: p.due,
      due: ch.due && ch.due !== p.due ? ch.due : prev?.due ?? "",
      done: ch.done || !!prev?.done,
      note: [prev?.note, ch.note].filter(Boolean).join(" "),
      quote: prev?.quote || ch.quote,
    });
  }
  const { changes: _ignored, ...rest } = r.data;
  void _ignored;
  return { ok: true, data: { ...rest, changes: [...merged.values()].sort((a, b) => a.number - b.number) } };
}

export type NewReply = {
  raw: string;
  source: "paste" | "file";
  fileName?: string;
  fromName: string;
  fromEmail: string;
  summary: string | null;
  deadline: string;
  newPoints: { text: string; due: string; quote: string }[];
  changes: { pointId: string; due: string; done: boolean; note: string; quote: string }[];
};

export async function addReply(caseId: string, input: NewReply, files?: FormData): Promise<{ ok: true; position: number } | { ok: false; error: string }> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const c = await caseFor(me, caseId);
  if (!c) return { ok: false, error: "That case isn't available." };
  const raw = String(input?.raw ?? "").trim();
  if (!raw || raw.length > MAX_EMAIL) return { ok: false, error: "The reply text is missing or too long." };
  const mail = splitEmail(raw);
  const from = parseAddress(mail.from);
  const fromName = (String(input.fromName ?? "").trim() || from.name).slice(0, 120);
  const fromEmail = (String(input.fromEmail ?? "").trim() || from.email).slice(0, 200);
  const source = input.source === "file" ? "file" : "paste";
  const fileName = source === "file" ? String(input.fileName ?? "").slice(0, 200) || null : null;
  const file = source === "file" ? await fileFrom(files) : null;
  const newPoints = (Array.isArray(input.newPoints) ? input.newPoints : [])
    .map((p) => ({ text: String(p?.text ?? "").trim().slice(0, 300), due: isISODate(p?.due) ? p.due : null, quote: String(p?.quote ?? "").trim().slice(0, 1200) || null }))
    .filter((p) => p.text)
    .slice(0, 30);
  const existing = new Map(
    (await q<{ id: string; status: Status; due: string | null }>("select id::text as id, status, due::text as due from points where case_id = $1", [c.id])).map((p) => [p.id, p]),
  );
  const changes = (Array.isArray(input.changes) ? input.changes : [])
    .map((ch) => ({
      p: existing.get(String(ch?.pointId)),
      due: isISODate(ch?.due) ? ch.due : null,
      done: ch?.done === true,
      note: String(ch?.note ?? "").trim().slice(0, 300),
    }))
    .filter((ch) => ch.p);

  let added = 0;
  let moved = 0;
  let done = 0;
  let notes = 0;
  const position = await tx(async (t) => {
    const pos = (await t.query<{ n: number }>("select coalesce(max(position), 0)::int + 1 as n from case_emails where case_id = $1", [c.id])).rows[0].n;
    const em = await t.query<{ id: string }>(
      `insert into case_emails (case_id, position, from_name, from_email, email_to, email_sent, subject, body, source, file_name, added_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id::text as id`,
      [c.id, pos, fromName, fromEmail, mail.to.slice(0, 300), mail.sent.slice(0, 120), mail.subject.slice(0, 300), mail.body || raw, source, fileName, me.id],
    );
    const emailId = em.rows[0].id;
    if (file) {
      await t.query("insert into email_files (email_id, name, mime, size, data) values ($1, $2, $3, $4, $5)", [emailId, file.name, file.mime, file.size, file.data]);
    }
    let next = (await t.query<{ n: number }>("select coalesce(max(position), 0)::int as n from points where case_id = $1", [c.id])).rows[0].n;
    for (const p of newPoints) {
      const pr = await t.query<{ id: string }>(
        "insert into points (case_id, email_id, position, text, source_quote, due) values ($1, $2, $3, $4, $5, $6) returning id::text as id",
        [c.id, emailId, ++next, p.text, p.quote, p.due],
      );
      await t.query("insert into point_events (point_id, user_id, kind, email_id) values ($1, $2, 'created', $3)", [pr.rows[0].id, me.id, emailId]);
      added++;
    }
    for (const ch of changes) {
      const p = ch.p!;
      const locked = p.status === "approved" && me.role !== "lead";
      if (ch.note) {
        await t.query("insert into point_events (point_id, user_id, kind, text, email_id) values ($1, $2, 'reply', $3, $4)", [p.id, me.id, ch.note, emailId]);
        notes++;
      }
      if (locked) continue;
      if (ch.due && ch.due !== p.due) {
        await t.query("update points set due = $1, updated_at = now() where id = $2", [ch.due, p.id]);
        await t.query("insert into point_events (point_id, user_id, kind, due, email_id) values ($1, $2, 'due', $3, $4)", [p.id, me.id, ch.due, emailId]);
        moved++;
      }
      if (ch.done && p.status !== "done" && p.status !== "approved") {
        await t.query("update points set status = 'done', wait_reason = null, updated_at = now() where id = $1", [p.id]);
        await t.query("insert into point_events (point_id, user_id, kind, status, email_id) values ($1, $2, 'status', 'done', $3)", [p.id, me.id, emailId]);
        done++;
      }
    }
    const parts = [
      added && `${added} new point${added === 1 ? "" : "s"}`,
      moved && `${moved} deadline${moved === 1 ? "" : "s"} moved`,
      done && `${done} marked done`,
      notes && `${notes} point${notes === 1 ? "" : "s"} updated`,
    ].filter(Boolean);
    await t.query("update case_emails set change_note = $1 where id = $2", [parts.length ? parts.join(" · ") : "No changes to the points", emailId]);
    const summary = typeof input.summary === "string" ? input.summary.trim().slice(0, 800) : null;
    await t.query(
      "update cases set summary = coalesce($1, summary), deadline = $2, updated_at = now() where id = $3",
      [summary || null, isISODate(input.deadline) ? input.deadline : null, c.id],
    );
    return pos;
  });

  touch(c.id);
  return { ok: true, position };
}

// ------------------------------------------------------------------ working on points

type PointCtx = { id: string; case_id: string; status: Status; owner_id: string };

async function pointFor(me: User, pointId: string): Promise<PointCtx | null> {
  if (!/^\d{1,12}$/.test(String(pointId))) return null;
  return one<PointCtx>(
    `select p.id::text as id, p.case_id::text as case_id, p.status, c.owner_id
       from points p join cases c on c.id = p.case_id
      where p.id = $1 and ($2::uuid is null or c.owner_id = $2 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $2))`,
    [pointId, me.role === "member" ? me.id : null],
  );
}

export type StatusExtra = { note?: string; files?: Uploaded[] };

async function saveAttachments(c: PoolClient, me: User, p: { id: string; case_id: string }, eventId: string, files: Verified[]) {
  for (const f of files) {
    await c.query(
      `insert into attachments (case_id, point_id, event_id, uploaded_by, name, mime, size, storage, url, pathname)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [p.case_id, p.id, eventId, me.id, f.name, f.mime, f.size, f.storage, f.url, f.pathname],
    );
  }
}

export async function setPointStatus(pointId: string, status: string, reason?: string, extra?: StatusExtra): Promise<ActionResult> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  if (!isStatus(status)) return { ok: false, error: "That status doesn't exist." };
  const p = await pointFor(me, pointId);
  if (!p) return { ok: false, error: "That point isn't available." };
  const blocked = statusBlocked(me.role, p.status, status);
  if (blocked) return { ok: false, error: blocked };
  const why = status === "wait" ? String(reason ?? "").trim().slice(0, 200) : "";
  if (status === "wait" && !why) return { ok: false, error: "Say what it's waiting on." };
  const note = String(extra?.note ?? "").trim().slice(0, 2000);
  const files = extra?.files?.length ? await verifyUploads(p.id, extra.files) : [];
  if (!Array.isArray(files)) return { ok: false, error: files.error };
  if (p.status === status && status !== "wait" && !note && !files.length) return { ok: true };
  await tx(async (c) => {
    if (p.status !== status || status === "wait") {
      await c.query("update points set status = $1, wait_reason = $2, updated_at = now() where id = $3", [status, why || null, p.id]);
    }
    const ev = await c.query<{ id: string }>(
      "insert into point_events (point_id, user_id, kind, status, text) values ($1, $2, 'status', $3, $4) returning id::text as id",
      [p.id, me.id, status, why || null],
    );
    await saveAttachments(c, me, p, ev.rows[0].id, files);
    if (note) {
      await c.query("insert into point_events (point_id, user_id, kind, text) values ($1, $2, $3, $4)", [p.id, me.id, me.role === "lead" ? "remark" : "update", note]);
    }
    await c.query("update cases set updated_at = now() where id = $1", [p.case_id]);
  });
  touch(p.case_id);
  return { ok: true };
}

export async function reopenPoint(pointId: string): Promise<ActionResult> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
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
  if (me.role === "admin") return VIEW_ONLY;
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
  if (me.role === "admin") return VIEW_ONLY;
  if (!/^\d{1,12}$/.test(String(caseId))) return { ok: false, error: "That case isn't available." };
  const d = due && isISODate(due) ? due : null;
  const rows = await q("update cases set deadline = $1, updated_at = now() where id = $2 and ($3::uuid is null or owner_id = $3 or exists (select 1 from case_members cm where cm.case_id = cases.id and cm.user_id = $3)) returning id", [
    d,
    caseId,
    me.role === "member" ? me.id : null,
  ]);
  if (!rows.length) return { ok: false, error: "That case isn't available." };
  touch(caseId);
  return { ok: true };
}

export async function postNote(pointId: string, text: string, files?: Uploaded[]): Promise<ActionResult> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const body = String(text ?? "").trim().slice(0, 2000);
  const p = await pointFor(me, pointId);
  if (!p) return { ok: false, error: "That point isn't available." };
  const checked = files?.length ? await verifyUploads(p.id, files) : [];
  if (!Array.isArray(checked)) return { ok: false, error: checked.error };
  if (!body && !checked.length) return { ok: false, error: me.role === "lead" ? "Write the remark first." : "Write the update first." };
  await tx(async (c) => {
    const ev = await c.query<{ id: string }>(
      "insert into point_events (point_id, user_id, kind, text) values ($1, $2, $3, $4) returning id::text as id",
      [p.id, me.id, me.role === "lead" ? "remark" : "update", body || null],
    );
    await saveAttachments(c, me, p, ev.rows[0].id, checked);
    await c.query("update cases set updated_at = now() where id = $1", [p.case_id]);
  });
  touch(p.case_id);
  return { ok: true };
}

export async function addPoint(caseId: string, text: string, due: string | null): Promise<ActionResult> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  const body = String(text ?? "").trim().slice(0, 300);
  if (!body) return { ok: false, error: "Say what needs to be done." };
  if (!/^\d{1,12}$/.test(String(caseId))) return { ok: false, error: "That case isn't available." };
  const c = await one<{ id: string }>("select id::text as id from cases where id = $1 and ($2::uuid is null or owner_id = $2 or exists (select 1 from case_members cm where cm.case_id = cases.id and cm.user_id = $2))", [
    caseId,
    me.role === "member" ? me.id : null,
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

// ------------------------------------------------------------------ shared cases

/** Sets who works on a case with its owner. The Lead can do this on any case; a Member only on cases they own. */
export async function setCaseMembers(caseId: string, userIds: string[]): Promise<ActionResult> {
  const me = await requireUser();
  if (me.role === "admin") return VIEW_ONLY;
  if (!/^\d{1,12}$/.test(String(caseId))) return { ok: false, error: "That case isn't available." };
  const c = await one<{ id: string; owner_id: string }>(
    `select id::text as id, owner_id from cases c
      where c.id = $1 and ($2::uuid is null or c.owner_id = $2 or exists (select 1 from case_members cm where cm.case_id = c.id and cm.user_id = $2))`,
    [caseId, me.role === "member" ? me.id : null],
  );
  if (!c) return { ok: false, error: "That case isn't available." };
  if (me.role !== "lead" && c.owner_id !== me.id) return { ok: false, error: "Only the Lead or the case owner can change who's on this case." };
  const keep = await teammates(userIds, c.owner_id);
  await tx(async (t) => {
    await t.query("delete from case_members where case_id = $1 and not (user_id = any($2::uuid[]))", [c.id, keep]);
    for (const uid of keep) {
      await t.query("insert into case_members (case_id, user_id, added_by) values ($1, $2, $3) on conflict do nothing", [c.id, uid, me.id]);
    }
    await t.query("update cases set updated_at = now() where id = $1", [c.id]);
  });
  touch(c.id);
  return { ok: true };
}
