"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Uploaded } from "@/lib/attach-rules";
import { verifyUploads } from "@/lib/attachments";
import { destroySession, hashPassword, hashToken } from "@/lib/auth";
import { isUniqueViolation, one, q, tx } from "@/lib/db";
import { cleanEmail, cleanName, isEmail, nameProblem, passwordProblem, type FormState } from "@/lib/forms";
import { isISODate } from "@/lib/time";
import { createVendorSession, destroyVendorSession, requireVendor } from "@/lib/vendor-auth";
import { CURRENCIES, money } from "@/lib/vendor-labels";
import * as jobs from "@/lib/jobs";

type Result = { ok: true } | { ok: false; error: string };
const VIEW = { ok: false as const, error: "You are looking at this vendor's portal as Admin. Nothing can be changed here." };
const GONE = { ok: false as const, error: "That request isn't available." };
const isId = (v: unknown) => /^\d{1,12}$/.test(String(v));

/** Someone at a vendor opens the company's join link and makes their own account. */
export async function joinVendor(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const name = cleanName(form.get("name"));
  const email = cleanEmail(form.get("email"));
  const password = String(form.get("password") ?? "");
  const fields = { name, email };
  const vendor = token ? await one<{ id: string }>("select id::text as id from vendors where invite_hash = $1 and invite_expires > now() and status = 'active'", [hashToken(token)]) : null;
  if (!vendor) return { error: "This link has expired. Ask your contact at Agthia for a new one.", fields };
  const problem = nameProblem(name) ?? (isEmail(email) ? null : "Enter a valid email address.") ?? passwordProblem(password, String(form.get("confirm") ?? ""));
  if (problem) return { error: problem, fields };
  if (await one("select 1 from users where lower(email) = $1", [email])) return { error: "That email already has an account. Use a different email.", fields };
  let id: string;
  try {
    const row = await one<{ id: string }>("insert into vendor_users (vendor_id, name, email, password_hash) values ($1, $2, $3, $4) returning id", [vendor.id, name, email, await hashPassword(password)]);
    id = row!.id;
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "That email already has an account. Sign in instead.", fields };
    throw e;
  }
  await destroySession();
  await createVendorSession(id);
  redirect("/portal");
}

export async function portalLogout(): Promise<void> {
  await destroyVendorSession();
  redirect("/login");
}

const touch = (id: string) => {
  revalidatePath("/portal", "layout");
  revalidatePath(`/vendors/rfq/${id}`);
};
/** The request, if it was sent to this vendor. */
const mine = (vendorId: string, id: string) =>
  isId(id) ? one<{ status: string; awarded_vendor_id: string | null; state: string }>("select r.status, r.awarded_vendor_id::text as awarded_vendor_id, rv.state from rfqs r join rfq_vendors rv on rv.rfq_id = r.id where r.id = $1 and rv.vendor_id = $2", [id, vendorId]) : null;

export type QuoteInput = { price: string; currency: string; validUntil: string; readyOn: string; note: string; files: Uploaded[] };

/** "Can do": the vendor gives or updates a price. Every price is kept on record. */
export async function submitQuote(id: string, input: QuoteInput): Promise<Result> {
  const v = await requireVendor();
  if (v.viewOnly) return VIEW;
  const r = await mine(v.vendor_id, id);
  if (!r) return GONE;
  if (r.status !== "open") return { ok: false, error: "This request is closed for quotes." };
  const price = Number(String(input?.price ?? "").replace(/[, ]/g, ""));
  if (!Number.isFinite(price) || price <= 0 || price > 999_999_999) return { ok: false, error: "Enter your price as a number." };
  const currency = CURRENCIES.includes(input?.currency) ? input.currency : "AED";
  const note = String(input?.note ?? "").trim().slice(0, 2000) || null;
  const valid = isISODate(input?.validUntil) ? input.validUntil : null;
  const ready = isISODate(input?.readyOn) ? input.readyOn : null;
  const files = input.files?.length ? await verifyUploads("vq", input.files) : [];
  if (!Array.isArray(files)) return { ok: false, error: files.error };
  await tx(async (c) => {
    const before = (await c.query<{ price: string | null; currency: string | null; state: string }>("select price::text as price, currency, state from rfq_vendors where rfq_id = $1 and vendor_id = $2 for update", [id, v.vendor_id])).rows[0];
    await c.query("update rfq_vendors set state = 'quoted', price = $3, currency = $4, valid_until = $5, ready_on = $6, note = $7, decline_reason = null, quoted_at = coalesce(quoted_at, now()) where rfq_id = $1 and vendor_id = $2", [id, v.vendor_id, price, currency, valid, ready, note]);
    await c.query("insert into rfq_quotes (rfq_id, vendor_id, vendor_user_id, price, currency, valid_until, ready_on, note) values ($1, $2, $3, $4, $5, $6, $7, $8)", [id, v.vendor_id, v.id, price, currency, valid, ready, note]);
    for (const f of files) await c.query("insert into rfq_files (rfq_id, vendor_id, name, mime, size, storage, url, pathname) values ($1, $2, $3, $4, $5, $6, $7, $8)", [id, v.vendor_id, f.name, f.mime, f.size, f.storage, f.url, f.pathname]);
    const was = before?.state === "quoted" && before.price != null ? ` (was ${money(before.price, before.currency)})` : "";
    await c.query("insert into rfq_messages (rfq_id, vendor_id, vendor_user_id, kind, body) values ($1, $2, $3, 'system', $4)", [id, v.vendor_id, v.id, `${v.vendor} ${was ? "changed the quote to" : "quoted"} ${money(price, currency)}${was}.`]);
    await c.query("update rfqs set updated_at = now() where id = $1", [id]);
  });
  touch(id);
  return { ok: true };
}

/** "Can't do", with a reason. They can still send a quote later while the request is open. */
export async function declineRequest(id: string, reason: string): Promise<Result> {
  const v = await requireVendor();
  if (v.viewOnly) return VIEW;
  const r = await mine(v.vendor_id, id);
  if (!r) return GONE;
  if (r.status !== "open") return { ok: false, error: "This request is already closed." };
  const why = String(reason ?? "").trim().slice(0, 500);
  if (!why) return { ok: false, error: "Add a short reason, for example no trucks free that day." };
  await tx(async (c) => {
    await c.query("update rfq_vendors set state = 'declined', decline_reason = $3, price = null, currency = null, quoted_at = coalesce(quoted_at, now()) where rfq_id = $1 and vendor_id = $2", [id, v.vendor_id, why]);
    await c.query("insert into rfq_messages (rfq_id, vendor_id, vendor_user_id, kind, body) values ($1, $2, $3, 'system', $4)", [id, v.vendor_id, v.id, `${v.vendor} can't do this one: ${why}`]);
  });
  touch(id);
  return { ok: true };
}

/** The chosen vendor confirms the job. */
export async function confirmJob(id: string): Promise<Result> {
  const v = await requireVendor();
  if (v.viewOnly) return VIEW;
  const r = await mine(v.vendor_id, id);
  if (!r) return GONE;
  if (r.status !== "awarded" || r.awarded_vendor_id !== v.vendor_id) return { ok: false, error: "There is nothing to confirm on this request." };
  await tx(async (c) => {
    await c.query("update rfqs set status = 'confirmed', updated_at = now() where id = $1", [id]);
    await c.query("insert into rfq_messages (rfq_id, vendor_id, vendor_user_id, kind, body) values ($1, $2, $3, 'system', $4)", [id, v.vendor_id, v.id, `${v.vendor} confirmed the job.`]);
  });
  touch(id);
  return { ok: true };
}

export async function sendVendorMessage(id: string, body: string): Promise<Result> {
  const v = await requireVendor();
  if (v.viewOnly) return VIEW;
  const r = await mine(v.vendor_id, id);
  if (!r) return GONE;
  const msg = String(body ?? "").trim().slice(0, 2000);
  if (!msg) return { ok: false, error: "Write a message first." };
  await q("insert into rfq_messages (rfq_id, vendor_id, vendor_user_id, kind, body) values ($1, $2, $3, 'text', $4)", [id, v.vendor_id, v.id, msg]);
  touch(id);
  return { ok: true };
}

export async function markPortalRead(id: string): Promise<void> {
  const v = await requireVendor();
  if (isId(id) && !v.admin) await q("update rfq_vendors set vendor_read_at = now() where rfq_id = $1 and vendor_id = $2", [id, v.vendor_id]);
}

// ------------------------------------------------------------------ jobs (milestones)

/** Runs a milestone action as the vendor. They can only touch jobs their company won. */
async function onMilestone(mid: string, run: (who: jobs.Who) => Promise<Result & { rfqId?: string }>): Promise<Result> {
  const v = await requireVendor();
  if (v.viewOnly) return VIEW;
  const r = await run({ userId: null, vendorUserId: v.id, name: v.name, vendorScope: v.vendor_id });
  if (r.ok && r.rfqId) touch(r.rfqId);
  return r.ok ? { ok: true } : r;
}
export async function tickStep(mid: string, note: string, files: Uploaded[]): Promise<Result> {
  const v = await requireVendor();
  // The Admin trying the sandbox uploads through the team's route.
  const checked = files?.length ? await verifyUploads(v.admin ? "apv" : "vq", files) : [];
  if (!Array.isArray(checked)) return { ok: false, error: checked.error };
  return onMilestone(mid, (who) => jobs.tickMilestone(who, mid, note, checked));
}
export const untickStep = async (mid: string): Promise<Result> => onMilestone(mid, (who) => jobs.untickMilestone(who, mid));
export const commentStep = async (mid: string, body: string): Promise<Result> => onMilestone(mid, (who) => jobs.commentMilestone(who, mid, body));
export const flagStep = async (mid: string, what: string, eta: string): Promise<Result> => onMilestone(mid, (who) => jobs.flagProblem(who, mid, what, eta));
export const resolveStep = async (mid: string): Promise<Result> => onMilestone(mid, (who) => jobs.resolveProblem(who, mid));
