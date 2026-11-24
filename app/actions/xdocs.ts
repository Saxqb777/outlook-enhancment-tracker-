"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { PoolClient } from "pg";
import { logActivity } from "@/lib/activity";
import type { Uploaded } from "@/lib/attach-rules";
import { removeStored, verifyUploads } from "@/lib/attachments";
import { requireUser, type User } from "@/lib/auth";
import { one, q, tx } from "@/lib/db";
import { pushSweep } from "@/lib/push";
import { isISODate, todayISO } from "@/lib/time";
import { docsAccess } from "@/lib/xdocs";

type Result = { ok: true } | { ok: false; error: string };
const NO = { ok: false as const, error: "Only the person who keeps the export documents, and the Leads, can change this. You can look and download." };
const GONE = { ok: false as const, error: "That isn't available any more." };
const isId = (v: unknown) => /^\d{1,12}$/.test(String(v ?? ""));
const t = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const long = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const money = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 1e8 ? Math.round(n * 100) / 100 : 0;
};

async function manager(): Promise<User | null> {
  const me = await requireUser();
  return docsAccess(me).manage ? me : null;
}
function touch(shipmentId?: string | null) {
  revalidatePath("/docs", "layout");
  if (shipmentId) revalidatePath(`/docs/${shipmentId}`);
}

/** After money moves on a card: raise the "running low" alert once when it crosses the line, and re-arm it after a top-up. */
async function checkCard(c: PoolClient, cardId: string): Promise<boolean> {
  const r = (
    await c.query<{ used: number; alert_at: number; credit_limit: number; alerted: boolean }>(
      `select (k.opening_used + coalesce((select sum(case when t.kind = 'spend' then t.amount else -t.amount end) from xd_txns t where t.card_id = k.id), 0))::float as used,
              k.alert_at::float as alert_at, k.credit_limit::float as credit_limit, k.alerted from xd_cards k where k.id = $1 for update`,
      [cardId],
    )
  ).rows[0];
  if (!r) return false;
  if (r.used >= r.alert_at && !r.alerted) {
    await c.query("update xd_cards set alerted = true where id = $1", [cardId]);
    await c.query("insert into xd_alerts (card_id, used, credit_limit) values ($1, $2, $3)", [cardId, r.used, r.credit_limit]);
    return true;
  }
  if (r.used < r.alert_at && r.alerted) await c.query("update xd_cards set alerted = false where id = $1", [cardId]);
  return false;
}
const tell = (alert: boolean) => alert && after(() => pushSweep(true));

// ------------------------------------------------------------------ shipments

export type ShipmentInput = { customer: string; country: string; invoice_no: string; incoterm: string; shipped_on: string; notes: string };
export async function saveShipment(id: string | null, input: ShipmentInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const me = await manager();
  if (!me) return NO;
  const customer = t(input?.customer, 160);
  if (customer.length < 2) return { ok: false, error: "Enter the customer's name." };
  const vals = [customer, t(input.country, 80), t(input.invoice_no, 80), t(input.incoterm, 10).toUpperCase(), isISODate(input.shipped_on) ? input.shipped_on : null, long(input.notes, 2000)];
  let sid = id;
  if (id) {
    if (!isId(id)) return GONE;
    const r = await q("update xd_shipments set customer = $2, country = $3, invoice_no = $4, incoterm = $5, shipped_on = $6, notes = $7, updated_at = now() where id = $1 returning id", [id, ...vals]);
    if (!r.length) return GONE;
  } else {
    const r = await one<{ id: string }>("insert into xd_shipments (customer, country, invoice_no, incoterm, shipped_on, notes, created_by) values ($1, $2, $3, $4, $5, $6, $7) returning id::text as id", [...vals, me.id]);
    sid = r!.id;
  }
  touch(sid);
  return { ok: true, id: sid! };
}

export async function removeShipment(id: string): Promise<Result> {
  const me = await manager();
  if (!me) return NO;
  if (!isId(id)) return GONE;
  const busy = await one("select 1 from xd_docs where shipment_id = $1 union all select 1 from xd_txns where shipment_id = $1 limit 1", [id]);
  if (busy) return { ok: false, error: "Remove its documents and costs first, so nothing is lost by mistake." };
  const r = await one<{ customer: string }>("delete from xd_shipments where id = $1 returning customer", [id]);
  if (!r) return GONE;
  await logActivity({ userId: me.id }, "xd_shipment_removed", `Removed the empty export shipment for ${r.customer}`);
  touch();
  return { ok: true };
}

// ------------------------------------------------------------------ documents (each can carry its cost)

export type DocInput = { type_id: string; doc_number: string; notes: string; cost: number | string; card_id: string; paid_on: string; category_id: string; charge_customer: boolean };
/** Adds a document to a shipment, or changes one. A cost becomes a card transaction, so it is typed once. */
export async function saveDoc(shipmentId: string, docId: string | null, input: DocInput, file?: Uploaded | null): Promise<Result> {
  const me = await manager();
  if (!me) return NO;
  if (!isId(shipmentId) || (docId && !isId(docId)) || !isId(input?.type_id)) return GONE;
  const cost = money(input.cost);
  if (cost && !isId(input.card_id)) return { ok: false, error: "Which card paid for it?" };
  const checked = file ? await verifyUploads("xd", [file]) : [];
  if (!Array.isArray(checked)) return { ok: false, error: checked.error };
  const f = checked[0] ?? null;
  let oldFile: { storage: string; url: string } | null = null;
  let alert = false;
  const r = await tx<Result>(async (c) => {
    const ship = (await c.query<{ customer: string }>("select customer from xd_shipments where id = $1", [shipmentId])).rows[0];
    const type = (await c.query("select 1 from xd_types where id = $1", [input.type_id])).rows[0];
    if (!ship || !type) return GONE;
    let id = docId;
    if (id) {
      const cur = (await c.query<{ storage: string | null; url: string | null }>("select storage, url from xd_docs where id = $1 and shipment_id = $2 for update", [id, shipmentId])).rows[0];
      if (!cur) return GONE;
      await c.query("update xd_docs set type_id = $2, doc_number = $3, notes = $4 where id = $1", [id, input.type_id, t(input.doc_number, 80), long(input.notes, 1000)]);
      if (f) {
        if (cur.url && cur.storage) oldFile = { storage: cur.storage, url: cur.url };
        await c.query("update xd_docs set name = $2, mime = $3, size = $4, storage = $5, url = $6, pathname = $7 where id = $1", [id, f.name, f.mime, f.size, f.storage, f.url, f.pathname]);
      }
    } else {
      id = (
        await c.query<{ id: string }>("insert into xd_docs (shipment_id, type_id, doc_number, notes, name, mime, size, storage, url, pathname, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id::text as id", [
          shipmentId, input.type_id, t(input.doc_number, 80), long(input.notes, 1000), f?.name ?? null, f?.mime ?? null, f?.size ?? null, f?.storage ?? null, f?.url ?? null, f?.pathname ?? null, me.id,
        ])
      ).rows[0].id;
    }
    const old = (await c.query<{ id: string; card_id: string }>("select id::text as id, card_id::text as card_id from xd_txns where doc_id = $1", [id])).rows[0];
    const cards = new Set<string>();
    if (old) cards.add(old.card_id);
    if (cost) {
      if (!(await c.query("select 1 from xd_cards where id = $1", [input.card_id])).rows[0]) return GONE;
      const args = [input.card_id, cost, isISODate(input.paid_on) ? input.paid_on : todayISO(), isId(input.category_id) ? input.category_id : null, shipmentId, input.charge_customer === true, ship.customer];
      if (old) await c.query("update xd_txns set card_id = $2, amount = $3, on_date = $4, category_id = $5, shipment_id = $6, charge_customer = $7, customer = $8 where id = $1", [old.id, ...args]);
      else await c.query("insert into xd_txns (card_id, amount, on_date, category_id, shipment_id, charge_customer, customer, doc_id, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [...args, id, me.id]);
      cards.add(String(input.card_id));
    } else if (old) await c.query("delete from xd_txns where id = $1", [old.id]);
    await c.query("update xd_shipments set updated_at = now() where id = $1", [shipmentId]);
    for (const k of cards) alert = (await checkCard(c, k)) || alert;
    return { ok: true };
  });
  if (r.ok && oldFile) await removeStored(oldFile);
  tell(alert);
  touch(shipmentId);
  return r;
}

export async function removeDoc(docId: string): Promise<Result> {
  const me = await manager();
  if (!me) return NO;
  if (!isId(docId)) return GONE;
  const r = await tx(async (c) => {
    const d = (await c.query<{ shipment_id: string; storage: string | null; url: string | null; type: string; doc_number: string; card_id: string | null }>(
      `delete from xd_docs d using xd_types ty where d.id = $1 and ty.id = d.type_id
       returning d.shipment_id::text as shipment_id, d.storage, d.url, ty.name as type, d.doc_number, (select t.card_id::text from xd_txns t where t.doc_id = d.id) as card_id`,
      [docId],
    )).rows[0];
    if (d?.card_id) await checkCard(c, d.card_id);
    return d;
  });
  if (!r) return GONE;
  if (r.url && r.storage) await removeStored({ storage: r.storage, url: r.url });
  await logActivity({ userId: me.id }, "xd_doc_removed", `Removed the document ${r.type}${r.doc_number ? ` ${r.doc_number}` : ""} and its cost`);
  touch(r.shipment_id);
  return { ok: true };
}

// ------------------------------------------------------------------ card transactions

export type TxnInput = { card_id: string; kind: "spend" | "topup"; amount: number | string; on_date: string; category_id: string; description: string; shipment_id: string; charge_customer: boolean; customer: string };
/** Any card payment that is not a document's own cost (food, visitors, duty exemption...), or a top-up from Finance. */
export async function saveTxn(id: string | null, input: TxnInput): Promise<Result> {
  const me = await manager();
  if (!me) return NO;
  if (!isId(input?.card_id) || (id && !isId(id))) return GONE;
  const amount = money(input.amount);
  if (!amount) return { ok: false, error: "Enter the amount." };
  const kind = input.kind === "topup" ? "topup" : "spend";
  if (kind === "spend" && !isId(input.category_id)) return { ok: false, error: "Pick what it was for." };
  let alert = false;
  const r = await tx<Result>(async (c) => {
    if (!(await c.query("select 1 from xd_cards where id = $1", [input.card_id])).rows[0]) return GONE;
    const ship = isId(input.shipment_id) && kind === "spend" ? (await c.query<{ id: string; customer: string }>("select id::text as id, customer from xd_shipments where id = $1", [input.shipment_id])).rows[0] : null;
    const args = [input.card_id, kind, amount, isISODate(input.on_date) ? input.on_date : todayISO(), kind === "spend" ? input.category_id : null, long(input.description, 300), ship?.id ?? null, kind === "spend" && input.charge_customer === true, kind === "spend" ? t(input.customer, 160) || ship?.customer || "" : ""];
    const cards = new Set<string>([String(input.card_id)]);
    if (id) {
      const old = (await c.query<{ card_id: string }>("select card_id::text as card_id from xd_txns where id = $1 and doc_id is null for update", [id])).rows[0];
      if (!old) return { ok: false, error: "This cost belongs to a document. Change it on the shipment." };
      cards.add(old.card_id);
      await c.query("update xd_txns set card_id = $2, kind = $3, amount = $4, on_date = $5, category_id = $6, description = $7, shipment_id = $8, charge_customer = $9, customer = $10 where id = $1", [id, ...args]);
    } else await c.query("insert into xd_txns (card_id, kind, amount, on_date, category_id, description, shipment_id, charge_customer, customer, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", [...args, me.id]);
    for (const k of cards) alert = (await checkCard(c, k)) || alert;
    return { ok: true };
  });
  tell(alert);
  touch(isId(input.shipment_id) ? input.shipment_id : null);
  return r;
}

export async function removeTxn(id: string): Promise<Result> {
  const me = await manager();
  if (!me) return NO;
  if (!isId(id)) return GONE;
  const r = await tx(async (c) => {
    const d = (await c.query<{ card_id: string; amount: string; kind: string; on_date: string; shipment_id: string | null }>("delete from xd_txns where id = $1 and doc_id is null returning card_id::text as card_id, amount::text as amount, kind, on_date::text as on_date, shipment_id::text as shipment_id", [id])).rows[0];
    if (d) await checkCard(c, d.card_id);
    return d;
  });
  if (!r) return { ok: false, error: "This cost belongs to a document. Remove it on the shipment." };
  await logActivity({ userId: me.id }, "xd_txn_removed", `Removed a card ${r.kind === "topup" ? "top-up" : "expense"} of AED ${r.amount} dated ${r.on_date}`);
  touch(r.shipment_id);
  return { ok: true };
}

/** The balance the bank reported by SMS: how much is still free on the card that day. */
export async function saveBankBalance(cardId: string, onDate: string, balance: number | string): Promise<Result> {
  const me = await manager();
  if (!me) return NO;
  if (!isId(cardId)) return GONE;
  const n = Number(String(balance ?? "").replace(/[, ]/g, ""));
  if (!Number.isFinite(n) || n < -1e8 || n > 1e8 || String(balance ?? "").trim() === "") return { ok: false, error: "Enter the balance from the bank's message." };
  const r = await q("insert into xd_balances (card_id, on_date, balance, created_by) select id, $2, $3, $4 from xd_cards where id = $1 returning id", [cardId, isISODate(onDate) ? onDate : todayISO(), Math.round(n * 100) / 100, me.id]);
  if (!r.length) return GONE;
  touch();
  return { ok: true };
}

// ------------------------------------------------------------------ setup: cards and the two lists

export type CardInput = { name: string; credit_limit: number | string; alert_at: number | string; statement_day: number | string; opening_used: number | string; active: boolean };
export async function saveCard(id: string | null, input: CardInput): Promise<Result> {
  const me = await manager();
  if (!me) return NO;
  const name = t(input?.name, 80);
  if (name.length < 2) return { ok: false, error: "Give the card a name, e.g. Ayoob's card." };
  const limit = money(input.credit_limit);
  const alertAt = money(input.alert_at);
  if (!limit) return { ok: false, error: "Enter the card's limit." };
  if (!alertAt || alertAt > limit) return { ok: false, error: "The alert level must be above 0 and not more than the limit." };
  const day = Math.min(31, Math.max(1, Math.round(Number(input.statement_day)) || 18));
  const opening = Math.max(0, Number(String(input.opening_used ?? "").replace(/[, ]/g, "")) || 0);
  let alert = false;
  try {
    await tx(async (c) => {
      let cid = id;
      if (id && isId(id)) await c.query("update xd_cards set name = $2, credit_limit = $3, alert_at = $4, statement_day = $5, opening_used = $6, active = $7 where id = $1", [id, name, limit, alertAt, day, opening, input.active !== false]);
      else cid = (await c.query<{ id: string }>("insert into xd_cards (name, credit_limit, alert_at, statement_day, opening_used) values ($1, $2, $3, $4, $5) returning id::text as id", [name, limit, alertAt, day, opening])).rows[0].id;
      alert = await checkCard(c, cid!);
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, error: "There is already a card with that name." };
    throw e;
  }
  await logActivity({ userId: me.id }, "xd_card_saved", `Saved the card "${name}": limit ${limit}, alert at ${alertAt}, statement day ${day}`);
  tell(alert);
  touch();
  return { ok: true };
}

async function addNamed(table: "xd_types" | "xd_categories", name: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const me = await manager();
  if (!me) return NO;
  const n = t(name, 60);
  if (n.length < 2) return { ok: false, error: "Type the name." };
  const have = await one<{ id: string }>(`select id::text as id from ${table} where lower(name) = lower($1)`, [n]);
  if (have) {
    await q(`update ${table} set active = true where id = $1`, [have.id]);
    touch();
    return { ok: true, id: have.id };
  }
  const r = await one<{ id: string }>(`insert into ${table} (name) values ($1) returning id::text as id`, [n]);
  await logActivity({ userId: me.id }, "xd_list_added", `Added "${n}" to the ${table === "xd_types" ? "document names" : "expense categories"}`);
  touch();
  return { ok: true, id: r!.id };
}
/** A new document name for everyone to use (kept to one spelling, so "BL" and "Bill of Lading" don't both appear). */
export const addDocType = async (name: string) => addNamed("xd_types", name);
export const addExpenseCategory = async (name: string) => addNamed("xd_categories", name);
