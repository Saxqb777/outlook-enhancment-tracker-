"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import type { PoolClient } from "pg";
import { aiBlocked, logActivity } from "@/lib/activity";
import type { Uploaded } from "@/lib/attach-rules";
import { openAttachment, verifyUploads, type Verified } from "@/lib/attachments";
import { requireUser, type User } from "@/lib/auth";
import { one, q, tx } from "@/lib/db";
import { extractRate, type RateExtract } from "@/lib/extract";
import { CURRENCIES, normEquip, num, quoteTotalAED, rtRef, money, fromAED, SERVICES, MODES, type Charge, type Equip, type Mode, type QuoteState, type Service, type UnitRate } from "@/lib/rate-calc";
import { getRequest, rateSettings, ratesAccess } from "@/lib/rates";
import { isISODate, todayISO } from "@/lib/time";

type Result = { ok: true } | { ok: false; error: string };
const NO = { ok: false as const, error: "Only the person who runs the rate book can change it. You can look and export." };
const GONE = { ok: false as const, error: "That isn't available any more." };
const isId = (v: unknown) => /^\d{1,12}$/.test(String(v));
const t = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const long = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

async function manager(): Promise<User | null> {
  const me = await requireUser();
  return ratesAccess(me).manage ? me : null;
}
function touch(id?: string) {
  revalidatePath("/rates", "layout");
  if (id) revalidatePath(`/rates/${id}`);
}

// ------------------------------------------------------------------ cleaning what was typed

export type RequestInput = {
  title: string; origin: string; origin_country: string; origin_port: string; destination: string; destination_country: string; destination_port: string;
  commodity: string; mode: string; service: string; incoterm: string; equipment: Equip[]; notes: string; requested_on: string;
};
export type QuoteInput = {
  supplier: string; state: string; quoted_on: string; currency: string; rates: UnitRate[]; charges: Charge[]; carrier: string; routing: string; transit: string; free_time: string;
  valid_until: string; remarks: string; exclusions: string; decline_reason: string; negotiated: boolean; contact?: string; contact_email?: string;
};
function cleanRequest(i: RequestInput) {
  const equipment = (Array.isArray(i?.equipment) ? i.equipment : []).map((e) => ({ type: normEquip(String(e?.type ?? "")), qty: Math.min(999, Math.max(1, Math.round(num(e?.qty)) || 1)) })).filter((e) => e.type).slice(0, 10);
  const origin = t(i?.origin, 120);
  const destination = t(i?.destination, 120);
  const commodity = t(i?.commodity, 160);
  const auto = [equipment.map((e) => `${e.qty}x${e.type}`).join(" + "), commodity, origin && destination ? `${origin} to ${destination}` : origin || destination].filter(Boolean).join(", ");
  return {
    title: t(i?.title, 200) || auto.slice(0, 200),
    origin, origin_country: t(i?.origin_country, 80), origin_port: t(i?.origin_port, 80),
    destination, destination_country: t(i?.destination_country, 80), destination_port: t(i?.destination_port, 80),
    commodity, mode: (["sea", "road", "air"].includes(i?.mode) ? i.mode : "sea") as Mode, service: (["d2d", "p2p", "d2p", "p2d"].includes(i?.service) ? i.service : "d2d") as Service,
    incoterm: t(i?.incoterm, 20).toUpperCase(), equipment, notes: long(i?.notes, 3000), requested_on: isISODate(i?.requested_on) ? i.requested_on : todayISO(),
  };
}
function cleanQuote(i: QuoteInput) {
  const cur = (c: unknown) => (CURRENCIES.includes(String(c).toUpperCase()) ? String(c).toUpperCase() : "USD");
  const state = (["quoted", "declined", "no_reply"].includes(i?.state) ? i.state : "quoted") as QuoteState;
  return {
    supplier: t(i?.supplier, 120), state, quoted_on: isISODate(i?.quoted_on) ? i.quoted_on : todayISO(), currency: cur(i?.currency),
    rates: state === "quoted" ? (Array.isArray(i?.rates) ? i.rates : []).map((r) => ({ type: normEquip(String(r?.type ?? "")), rate: Math.max(0, num(r?.rate)) })).filter((r) => r.type && r.rate > 0 && r.rate < 1e9).slice(0, 12) : [],
    charges: state === "quoted" ? (Array.isArray(i?.charges) ? i.charges : []).map((c) => ({ label: t(c?.label, 80), basis: c?.basis === "shipment" ? ("shipment" as const) : ("container" as const), amount: Math.max(0, num(c?.amount)), currency: cur(c?.currency || i?.currency) })).filter((c) => c.label && c.amount > 0 && c.amount < 1e9).slice(0, 60) : [],
    carrier: t(i?.carrier, 80), routing: t(i?.routing, 200), transit: t(i?.transit, 120), free_time: t(i?.free_time, 80), valid_until: isISODate(i?.valid_until) ? i.valid_until : null,
    remarks: long(i?.remarks, 2000), exclusions: long(i?.exclusions, 500), decline_reason: long(i?.decline_reason, 300), negotiated: i?.negotiated === true && state === "quoted",
    contact: t(i?.contact, 120), contact_email: t(i?.contact_email, 160),
  };
}
async function supplierId(c: PoolClient, name: string, contact = "", email = ""): Promise<string> {
  const r = await c.query<{ id: string }>(
    `insert into rate_suppliers (name, contact, email) values ($1, $2, $3)
     on conflict (lower(name)) do update set contact = case when rate_suppliers.contact = '' then excluded.contact else rate_suppliers.contact end,
                                              email = case when rate_suppliers.email = '' then excluded.email else rate_suppliers.email end
     returning id::text as id`,
    [name, contact, email],
  );
  return r.rows[0].id;
}
async function insertRequest(c: PoolClient, me: User, r: ReturnType<typeof cleanRequest>): Promise<string> {
  const x = await c.query<{ id: string }>(
    `insert into rate_requests (title, origin, origin_country, origin_port, destination, destination_country, destination_port, commodity, mode, service, incoterm, equipment, notes, requested_on, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15) returning id::text as id`,
    [r.title, r.origin, r.origin_country, r.origin_port, r.destination, r.destination_country, r.destination_port, r.commodity, r.mode, r.service, r.incoterm, JSON.stringify(r.equipment), r.notes, r.requested_on, me.id],
  );
  return x.rows[0].id;
}
async function insertQuote(c: PoolClient, me: User, requestId: string, k: ReturnType<typeof cleanQuote>, files: Verified[], replacesId: string | null): Promise<string> {
  const sid = await supplierId(c, k.supplier, k.contact, k.contact_email);
  const x = await c.query<{ id: string }>(
    `insert into rate_quotes (request_id, supplier_id, state, quoted_on, currency, rates, charges, carrier, routing, transit, free_time, valid_until, remarks, exclusions, decline_reason, negotiated, replaces_id, created_by)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) returning id::text as id`,
    [requestId, sid, k.state, k.quoted_on, k.currency, JSON.stringify(k.rates), JSON.stringify(k.charges), k.carrier, k.routing, k.transit, k.free_time, k.valid_until, k.remarks, k.exclusions, k.decline_reason, k.negotiated, replacesId, me.id],
  );
  const id = x.rows[0].id;
  for (const f of files) await c.query("insert into rate_files (request_id, quote_id, name, mime, size, storage, url, pathname) values ($1, $2, $3, $4, $5, $6, $7, $8)", [requestId, id, f.name, f.mime, f.size, f.storage, f.url, f.pathname]);
  await c.query("update rate_requests set updated_at = now() where id = $1", [requestId]);
  return id;
}
const checkQuote = (k: ReturnType<typeof cleanQuote>): string | null =>
  !k.supplier ? "Who is the supplier?" : k.state === "quoted" && !k.rates.length ? "Enter at least one rate, or mark the supplier as Declined or No reply." : null;

// ------------------------------------------------------------------ enquiries and quotes

/** A new enquiry, optionally with its first quote in the same step (the fast path after dropping a supplier's email). */
export async function createEnquiry(input: RequestInput, first?: QuoteInput | null, files?: Uploaded[]): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const me = await manager();
  if (!me) return NO;
  const r = cleanRequest(input);
  if (!r.origin && !r.destination) return { ok: false, error: "Enter where it's going from and to." };
  const k = first ? cleanQuote(first) : null;
  const bad = k ? checkQuote(k) : null;
  if (bad) return { ok: false, error: bad };
  const checked = files?.length ? await verifyUploads("apv", files) : [];
  if (!Array.isArray(checked)) return { ok: false, error: checked.error };
  const id = await tx(async (c) => {
    const rid = await insertRequest(c, me, r);
    if (k) await insertQuote(c, me, rid, k, checked, null);
    return rid;
  });
  touch(id);
  return { ok: true, id };
}

export async function updateEnquiry(id: string, input: RequestInput): Promise<Result> {
  const me = await manager();
  if (!me) return NO;
  if (!isId(id)) return GONE;
  const r = cleanRequest(input);
  const rows = await q(
    `update rate_requests set title = $2, origin = $3, origin_country = $4, origin_port = $5, destination = $6, destination_country = $7, destination_port = $8, commodity = $9, mode = $10,
            service = $11, incoterm = $12, equipment = $13::jsonb, notes = $14, requested_on = $15, updated_at = now() where id = $1 returning id`,
    [id, r.title, r.origin, r.origin_country, r.origin_port, r.destination, r.destination_country, r.destination_port, r.commodity, r.mode, r.service, r.incoterm, JSON.stringify(r.equipment), r.notes, r.requested_on],
  );
  if (!rows.length) return GONE;
  touch(id);
  return { ok: true };
}

/** Adds a supplier's quote. With `replaceId` it is a correction: the old version is kept and marked as replaced. */
export async function saveQuote(requestId: string, input: QuoteInput, files?: Uploaded[], replaceId?: string | null): Promise<Result> {
  const me = await manager();
  if (!me) return NO;
  if (!isId(requestId)) return GONE;
  const k = cleanQuote(input);
  const bad = checkQuote(k);
  if (bad) return { ok: false, error: bad };
  const checked = files?.length ? await verifyUploads("apv", files) : [];
  if (!Array.isArray(checked)) return { ok: false, error: checked.error };
  const r = await tx<Result>(async (c) => {
    const req = (await c.query<{ id: string; awarded_quote_id: string | null }>("select id::text as id, awarded_quote_id::text as awarded_quote_id from rate_requests where id = $1 for update", [requestId])).rows[0];
    if (!req) return GONE;
    let old: string | null = null;
    if (replaceId && isId(replaceId)) {
      const o = (await c.query<{ id: string }>("update rate_quotes set replaced_at = now() where id = $1 and request_id = $2 and replaced_at is null returning id::text as id", [replaceId, requestId])).rows[0];
      if (!o) return GONE;
      old = o.id;
    }
    const nid = await insertQuote(c, me, requestId, k, checked, old);
    if (old) {
      await c.query("update rate_files set quote_id = $1 where quote_id = $2", [nid, old]);
      if (req.awarded_quote_id === old) await c.query("update rate_requests set awarded_quote_id = $1 where id = $2", [nid, requestId]);
    }
    return { ok: true };
  });
  touch(requestId);
  return r;
}

/** Takes a quote out of the comparison (entered by mistake). It stays in the history as removed. */
export async function removeQuote(quoteId: string): Promise<Result> {
  const me = await manager();
  if (!me) return NO;
  if (!isId(quoteId)) return GONE;
  const r = await one<{ request_id: string }>(
    "update rate_quotes x set replaced_at = now() where x.id = $1 and x.replaced_at is null and not exists (select 1 from rate_requests r where r.awarded_quote_id = x.id) returning request_id::text as request_id",
    [quoteId],
  );
  if (!r) return { ok: false, error: "This quote is the awarded one. Undo the award first." };
  touch(r.request_id);
  return { ok: true };
}

export async function setNegotiated(quoteId: string, on: boolean): Promise<Result> {
  const me = await manager();
  if (!me) return NO;
  if (!isId(quoteId)) return GONE;
  const r = await one<{ request_id: string }>("update rate_quotes set negotiated = $2 where id = $1 and state = 'quoted' returning request_id::text as request_id", [quoteId, on]);
  if (!r) return GONE;
  touch(r.request_id);
  return { ok: true };
}

export async function awardQuote(requestId: string, quoteId: string | null, reason: string, pr: string, bufferPct: number): Promise<Result> {
  const me = await manager();
  if (!me) return NO;
  if (!isId(requestId)) return GONE;
  if (!quoteId) {
    await q("update rate_requests set status = 'open', awarded_quote_id = null, award_reason = null, updated_at = now() where id = $1", [requestId]);
    touch(requestId);
    return { ok: true };
  }
  if (!isId(quoteId)) return GONE;
  const okq = await one("select 1 from rate_quotes where id = $1 and request_id = $2 and state = 'quoted' and replaced_at is null", [quoteId, requestId]);
  if (!okq) return { ok: false, error: "Pick a supplier who has quoted." };
  const buf = Math.min(50, Math.max(0, num(bufferPct)));
  await q("update rate_requests set status = 'awarded', awarded_quote_id = $2, award_reason = $3, pr_number = $4, po_buffer_pct = $5, updated_at = now() where id = $1", [requestId, quoteId, long(reason, 500) || null, t(pr, 40) || null, buf]);
  await q("update rate_quotes set negotiated = true where id = $1", [quoteId]);
  touch(requestId);
  return { ok: true };
}

/** Creates a request in the Approvals section, with the comparison written out, for the chosen people to sign. */
export async function sendRateForApproval(requestId: string, signerIds: string[]): Promise<{ ok: true; approvalId: string } | { ok: false; error: string }> {
  const me = await manager();
  if (!me) return NO;
  const r = await getRequest(String(requestId));
  if (!r || !r.awarded_quote_id) return { ok: false, error: "Choose the supplier first, then send it for approval." };
  const ids = [...new Set((Array.isArray(signerIds) ? signerIds : []).map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x) && x !== me.id))].slice(0, 10);
  const signers = ids.length ? await q<{ id: string }>("select id from users where id = any($1::uuid[]) and status = 'active' and role <> 'admin'", [ids]) : [];
  if (!signers.length) return { ok: false, error: "Pick at least one person to approve." };
  const { fx } = await rateSettings();
  const won = r.quotes.find((x) => x.id === r.awarded_quote_id)!;
  const line = (x: (typeof r.quotes)[number]) => {
    if (x.state !== "quoted") return `- ${x.supplier}: ${x.state === "declined" ? `declined${x.decline_reason ? ` (${x.decline_reason})` : ""}` : "no reply"}`;
    const tot = quoteTotalAED(x, r.equipment, fx);
    return `- ${x.supplier}: ${x.rates.map((y) => `${y.type} ${money(y.rate, x.currency)}`).join(", ")}; total AED ${Math.round(tot.total).toLocaleString("en-US")} (USD ${Math.round(fromAED(tot.total, "USD", fx)).toLocaleString("en-US")})${x.transit ? `; transit ${x.transit}` : ""}`;
  };
  const total = quoteTotalAED(won, r.equipment, fx).total;
  const body = [
    `Freight rate approval, ${rtRef(r.id)}`,
    `Shipment: ${r.title}`,
    `Route: ${[r.origin, r.origin_country].filter(Boolean).join(", ")} to ${[r.destination, r.destination_country].filter(Boolean).join(", ")}`,
    `Commodity: ${r.commodity || "-"} | ${MODES[r.mode]} | ${SERVICES[r.service]}${r.incoterm ? ` | ${r.incoterm}` : ""}`,
    `Equipment: ${r.equipment.map((e) => `${e.qty} x ${e.type}`).join(", ") || "-"}`,
    "",
    "Quotations received:",
    ...r.quotes.map(line),
    "",
    `Proposed supplier: ${won.supplier}`,
    `Reason: ${r.award_reason || "-"}`,
    `Total: AED ${Math.round(total).toLocaleString("en-US")}. PO value with ${r.po_buffer_pct}% buffer: AED ${Math.round(total * (1 + r.po_buffer_pct / 100)).toLocaleString("en-US")}`,
    r.pr_number ? `PR: ${r.pr_number}` : "",
  ].filter((x) => x !== null).join("\n");
  const approvalId = await tx(async (c) => {
    const a = await c.query<{ id: string }>("insert into approvals (requester_id, title, body) values ($1, $2, $3) returning id::text as id", [me.id, `Freight rate: ${won.supplier}, ${r.title}`.slice(0, 200), body]);
    const aid = a.rows[0].id;
    for (const s of signers) await c.query("insert into approval_signers (approval_id, user_id) values ($1, $2)", [aid, s.id]);
    await c.query("insert into approval_events (approval_id, user_id, kind, version) values ($1, $2, 'created', 1)", [aid, me.id]);
    await c.query("update rate_requests set approval_id = $2, updated_at = now() where id = $1", [r.id, aid]);
    return aid;
  });
  touch(r.id);
  revalidatePath("/approvals");
  revalidatePath("/", "layout");
  return { ok: true, approvalId };
}

export async function saveSupplier(id: string | null, input: { name: string; contact: string; email: string; phone: string; notes: string }): Promise<Result> {
  const me = await manager();
  if (!me) return NO;
  const name = t(input?.name, 120);
  if (name.length < 2) return { ok: false, error: "Enter the supplier's name." };
  try {
    if (id && isId(id)) await q("update rate_suppliers set name = $2, contact = $3, email = $4, phone = $5, notes = $6 where id = $1", [id, name, t(input.contact, 120), t(input.email, 160), t(input.phone, 60), long(input.notes, 1000)]);
    else await q("insert into rate_suppliers (name, contact, email, phone, notes) values ($1, $2, $3, $4, $5)", [name, t(input.contact, 120), t(input.email, 160), t(input.phone, 60), long(input.notes, 1000)]);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, error: "A supplier with that name is already on the list." };
    throw e;
  }
  touch();
  return { ok: true };
}

export async function saveFx(fx: Record<string, number>): Promise<Result> {
  const me = await manager();
  if (!me) return NO;
  const clean: Record<string, number> = { AED: 1 };
  for (const c of CURRENCIES) if (c !== "AED") clean[c] = Math.min(1000, Math.max(0.0001, num(fx?.[c]) || 0)) || 1;
  await q("update rate_settings set fx = $1::jsonb where id = 1", [JSON.stringify(clean)]);
  touch();
  return { ok: true };
}

// ------------------------------------------------------------------ reading a supplier's file with the AI

async function readWithAI(me: User, text: string): Promise<{ ok: true; data: RateExtract } | { ok: false; error: string }> {
  const body = text.trim();
  if (body.length < 20) return { ok: false, error: "That file has no text to read. You can type the quote in yourself." };
  const blocked = await aiBlocked(me.id);
  if (blocked) return { ok: false, error: blocked };
  const t0 = Date.now();
  const r = await extractRate(body, todayISO());
  await q("insert into ai_reads (user_id, kind, ok, ms, chars, error) values ($1, 'new', $2, $3, $4, $5)", [me.id, r.ok, Date.now() - t0, body.length, r.ok ? null : r.error]).catch(() => {});
  return r;
}
/** The text of an email or PDF (already read in the browser) goes to the AI, which fills the quote form. */
export async function readRateText(text: string): Promise<{ ok: true; data: RateExtract } | { ok: false; error: string }> {
  const me = await manager();
  if (!me) return NO;
  return readWithAI(me, String(text ?? ""));
}
async function sheetText(file: Verified): Promise<string> {
  const body = await openAttachment(file);
  if (!body) return "";
  const buf = body instanceof Uint8Array ? Buffer.from(body) : Buffer.from(await new Response(body).arrayBuffer());
  if (file.mime === "text/csv" || file.mime === "text/plain") return buf.toString("utf8");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const out: string[] = [];
  wb.eachSheet((ws) => {
    out.push(`Sheet: ${ws.name}`);
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (c) => {
        let v: unknown = c.value;
        if (v && typeof v === "object" && !(v instanceof Date)) v = (v as { result?: unknown; text?: unknown }).result ?? (v as { text?: unknown }).text ?? "";
        if (v instanceof Date) v = v.toISOString().slice(0, 10);
        if (v !== "" && v != null) cells.push(String(v).replace(/\s+/g, " ").slice(0, 200));
      });
      if (cells.length) out.push(cells.join(" | "));
    });
  });
  return out.join("\n");
}
/** An Excel or CSV quotation that was just uploaded: read on the server, then the AI fills the quote form. */
export async function readRateSheet(file: Uploaded): Promise<{ ok: true; data: RateExtract } | { ok: false; error: string }> {
  const me = await manager();
  if (!me) return NO;
  const checked = await verifyUploads("apv", [file]);
  if (!Array.isArray(checked)) return { ok: false, error: checked.error };
  let text = "";
  try {
    text = await sheetText(checked[0]);
  } catch {
    return { ok: false, error: "That spreadsheet couldn't be opened. Save it as .xlsx and try again, or type the quote in." };
  }
  return readWithAI(me, text);
}

// ------------------------------------------------------------------ bulk import from Excel

const HEAD: [RegExp, string][] = [
  [/^(quot\w* )?date|^date/i, "date"], [/supplier|forwarder|vendor|provider/i, "supplier"], [/^(from|origin)$|origin \(from\)|^pol$|pickup/i, "origin"], [/origin.*country/i, "origin_country"], [/origin.*port|port of loading/i, "origin_port"],
  [/^(to|destination)$|destination \(to\)|^pod$|delivery/i, "destination"], [/dest\w*.*country/i, "destination_country"], [/dest\w*.*port|port of discharge/i, "destination_port"], [/commodity|cargo/i, "commodity"],
  [/mode/i, "mode"], [/container|truck|equipment/i, "type"], [/qty|quantity/i, "qty"], [/service/i, "service"], [/incoterm/i, "incoterm"], [/currency|^curr/i, "currency"], [/rate|freight|price|amount/i, "rate"],
  [/additional|other charge|charges/i, "extra"], [/transit/i, "transit"], [/valid/i, "valid"], [/remark|condition|note/i, "remarks"], [/carrier|line/i, "carrier"], [/free ?time/i, "free_time"],
];
const svc = (v: string): Service => (/port.*port|p2p|ptp/i.test(v) ? "p2p" : /door.*port|d2p|dtp/i.test(v) ? "d2p" : /port.*door|p2d|ptd/i.test(v) ? "p2d" : "d2d");
const mod = (v: string): Mode => (/road|truck|land/i.test(v) ? "road" : /air/i.test(v) ? "air" : "sea");
const dateOf = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  if (isISODate(s.slice(0, 10))) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    const iso = `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (isISODate(iso)) return iso;
  }
  const d = new Date(s);
  return s && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
};

/**
 * Loads old rates from a spreadsheet: one row per quotation, with a header row (Date, Supplier, From, To, Commodity,
 * Mode, Container, Qty, Service, Incoterm, Rate, Currency, Additional charges, Transit, Validity, Remarks).
 * Rows for the same route, cargo and date are grouped into one enquiry. Nothing existing is changed.
 */
export async function importRates(file: Uploaded): Promise<{ ok: true; enquiries: number; quotes: number; skipped: number } | { ok: false; error: string }> {
  const me = await manager();
  if (!me) return NO;
  const checked = await verifyUploads("apv", [file]);
  if (!Array.isArray(checked)) return { ok: false, error: checked.error };
  const body = await openAttachment(checked[0]);
  if (!body) return { ok: false, error: "That file didn't upload properly. Try again." };
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load((body instanceof Uint8Array ? Buffer.from(body) : Buffer.from(await new Response(body).arrayBuffer())) as unknown as ArrayBuffer);
  } catch {
    return { ok: false, error: "That file couldn't be opened. Save it as .xlsx and try again." };
  }
  type Row = Record<string, unknown>;
  const rows: Row[] = [];
  wb.eachSheet((ws) => {
    let map: Record<number, string> | null = null;
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: Record<number, unknown> = {};
      row.eachCell({ includeEmpty: false }, (c, col) => {
        let v: unknown = c.value;
        if (v && typeof v === "object" && !(v instanceof Date)) v = (v as { result?: unknown; text?: unknown }).result ?? (v as { text?: unknown }).text ?? "";
        vals[col] = v;
      });
      if (!map) {
        const m: Record<number, string> = {};
        for (const [col, v] of Object.entries(vals)) {
          const hit = HEAD.find(([rx]) => rx.test(String(v).trim()));
          if (hit && !Object.values(m).includes(hit[1])) m[Number(col)] = hit[1];
        }
        const have = Object.values(m);
        if (have.includes("supplier") && have.includes("rate") && (have.includes("origin") || have.includes("destination"))) map = m;
        return;
      }
      const r: Row = {};
      for (const [col, key] of Object.entries(map)) r[key] = vals[Number(col)];
      rows.push(r);
    });
  });
  if (!rows.length) return { ok: false, error: "No rows were found. The sheet needs a header row with at least Supplier, From or To, and Rate. Download the template to see the layout." };
  const s = (v: unknown, max = 120) => t(v instanceof Date ? v.toISOString().slice(0, 10) : v, max);
  let skipped = 0;
  const groups = new Map<string, { req: ReturnType<typeof cleanRequest>; quotes: Map<string, ReturnType<typeof cleanQuote>> }>();
  for (const r of rows.slice(0, 5000)) {
    const supplier = s(r.supplier);
    const rate = num(r.rate);
    if (!supplier || !(rate > 0) || (!s(r.origin) && !s(r.destination))) {
      skipped++;
      continue;
    }
    const date = dateOf(r.date) || todayISO();
    const type = normEquip(s(r.type, 40)) || "Shipment";
    const req = cleanRequest({ title: "", origin: s(r.origin), origin_country: s(r.origin_country, 80), origin_port: s(r.origin_port, 80), destination: s(r.destination), destination_country: s(r.destination_country, 80), destination_port: s(r.destination_port, 80), commodity: s(r.commodity, 160), mode: mod(s(r.mode)), service: svc(s(r.service)), incoterm: s(r.incoterm, 20), equipment: [{ type, qty: Math.max(1, Math.round(num(r.qty)) || 1) }], notes: "", requested_on: date });
    const key = [req.origin, req.destination, req.commodity, req.mode, req.service, date].join("|").toLowerCase();
    const g = groups.get(key) ?? { req, quotes: new Map<string, ReturnType<typeof cleanQuote>>() };
    if (!g.req.equipment.some((e) => e.type === type)) g.req.equipment.push({ type, qty: Math.max(1, Math.round(num(r.qty)) || 1) });
    g.req.title = "";
    const currency = s(r.currency, 3).toUpperCase() || "USD";
    const extra = num(r.extra);
    const k = g.quotes.get(supplier.toLowerCase()) ?? cleanQuote({ supplier, state: "quoted", quoted_on: date, currency, rates: [], charges: [], carrier: s(r.carrier, 80), routing: "", transit: s(r.transit), free_time: s(r.free_time, 80), valid_until: dateOf(r.valid), remarks: long(r.remarks instanceof Date ? "" : r.remarks, 2000), exclusions: "", decline_reason: "", negotiated: false });
    if (!k.rates.some((x) => x.type === type)) k.rates.push({ type, rate });
    if (extra > 0 && !k.charges.length) k.charges.push({ label: "Additional charges", basis: "container", amount: extra, currency: CURRENCIES.includes(currency) ? currency : "USD" });
    else if (!extra && typeof r.extra === "string" && r.extra.trim() && !k.remarks.includes(r.extra.trim())) k.remarks = `${k.remarks}${k.remarks ? "\n" : ""}Additional charges: ${r.extra.trim()}`.slice(0, 2000);
    g.quotes.set(supplier.toLowerCase(), k);
    groups.set(key, g);
  }
  if (!groups.size) return { ok: false, error: "None of the rows had a supplier, a route and a rate. Check the sheet against the template." };
  let quotes = 0;
  await tx(async (c) => {
    for (const g of groups.values()) {
      const rid = await insertRequest(c, me, cleanRequest({ ...g.req, title: "" }));
      for (const k of g.quotes.values()) {
        await insertQuote(c, me, rid, k, [], null);
        quotes++;
      }
    }
  });
  await logActivity({ userId: me.id }, "rates_import", `Imported ${quotes} freight quotes into ${groups.size} enquiries`);
  touch();
  return { ok: true, enquiries: groups.size, quotes, skipped };
}
