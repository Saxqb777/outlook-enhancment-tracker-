// Export Docs and Card Expenses: who can use them, and loading the records.
import type { User } from "@/lib/auth";
import { one, q } from "@/lib/db";

/** The person it is switched on for, and the Leads, add and change. The Admin looks. Everyone else: nothing. */
export const docsAccess = (u: User) => ({ view: !!u.can_docs || u.role === "lead" || u.role === "admin", manage: (!!u.can_docs || u.role === "lead") && u.role !== "admin" });

export const INCOTERMS_X = ["EXW", "FOB", "CNF", "CFR", "CIF", "FCA", "DAP", "DDP"];
/** With these terms the customer pays the documentation cost back, so "charge to customer" starts ticked. */
export const chargesBack = (incoterm: string) => incoterm.trim().toUpperCase() === "EXW";

export type Named = { id: string; name: string; active: boolean };
export const listTypes = () => q<Named>("select id::text as id, name, active from xd_types order by position, lower(name)");
export const listCategories = () => q<Named>("select id::text as id, name, active from xd_categories order by position, lower(name)");

export type Card = { id: string; name: string; credit_limit: number; alert_at: number; statement_day: number; opening_used: number; active: boolean; used: number; bank: number | null; bank_on: string | null; bank_used_then: number | null };
/** `used` = what is owed on the card now: the opening amount, plus everything spent, minus the top-ups. */
export const listCards = () =>
  q<Card>(
    `select c.id::text as id, c.name, c.credit_limit::float as credit_limit, c.alert_at::float as alert_at, c.statement_day, c.opening_used::float as opening_used, c.active,
            (c.opening_used + coalesce((select sum(case when t.kind = 'spend' then t.amount else -t.amount end) from xd_txns t where t.card_id = c.id), 0))::float as used,
            b.balance::float as bank, b.on_date::text as bank_on,
            (c.opening_used + coalesce((select sum(case when t.kind = 'spend' then t.amount else -t.amount end) from xd_txns t where t.card_id = c.id and t.on_date <= b.on_date), 0))::float as bank_used_then
       from xd_cards c left join lateral (select balance, on_date from xd_balances x where x.card_id = c.id order by x.on_date desc, x.id desc limit 1) b on true
      order by c.active desc, lower(c.name)`,
  );

export type Shipment = { id: string; customer: string; country: string; invoice_no: string; incoterm: string; shipped_on: string | null; notes: string; created_at: Date; by: string | null; docs: number; cost: number };
const SHIP = `s.id::text as id, s.customer, s.country, s.invoice_no, s.incoterm, s.shipped_on::text as shipped_on, s.notes, s.created_at, u.name as by,
              (select count(*)::int from xd_docs d where d.shipment_id = s.id) as docs,
              coalesce((select sum(t.amount) from xd_txns t where t.shipment_id = s.id and t.kind = 'spend'), 0)::float as cost`;
export const listShipments = () => q<Shipment>(`select ${SHIP} from xd_shipments s left join users u on u.id = s.created_by order by s.id desc limit 3000`);

export type Doc = { id: string; shipment_id: string; type_id: string; type: string; doc_number: string; notes: string; name: string | null; mime: string | null; size: number | null; created_at: Date; by: string | null; txn_id: string | null; cost: number | null; card_id: string | null; card: string | null; paid_on: string | null; category_id: string | null; charge_customer: boolean };
const DOC = `d.id::text as id, d.shipment_id::text as shipment_id, d.type_id::text as type_id, ty.name as type, d.doc_number, d.notes, d.name, d.mime, d.size::float as size, d.created_at, u.name as by,
             t.id::text as txn_id, t.amount::float as cost, t.card_id::text as card_id, c.name as card, t.on_date::text as paid_on, t.category_id::text as category_id, coalesce(t.charge_customer, false) as charge_customer`;
const DOC_FROM = `from xd_docs d join xd_types ty on ty.id = d.type_id left join users u on u.id = d.created_by left join xd_txns t on t.doc_id = d.id left join xd_cards c on c.id = t.card_id`;
export const listDocs = () => q<Doc>(`select ${DOC} ${DOC_FROM} order by d.id desc limit 10000`);

export type Txn = { id: string; card_id: string; card: string; kind: "spend" | "topup"; amount: number; on_date: string; category_id: string | null; category: string | null; description: string; shipment_id: string | null; doc_id: string | null; doc: string | null; charge_customer: boolean; customer: string; by: string | null };
const TXN = `t.id::text as id, t.card_id::text as card_id, c.name as card, t.kind, t.amount::float as amount, t.on_date::text as on_date, t.category_id::text as category_id, k.name as category, t.description,
             t.shipment_id::text as shipment_id, t.doc_id::text as doc_id, case when d.id is null then null else ty.name || case when d.doc_number = '' then '' else ' ' || d.doc_number end end as doc,
             t.charge_customer, coalesce(nullif(t.customer, ''), s.customer, '') as customer, u.name as by`;
const TXN_FROM = `from xd_txns t join xd_cards c on c.id = t.card_id left join xd_categories k on k.id = t.category_id left join xd_shipments s on s.id = t.shipment_id
                  left join xd_docs d on d.id = t.doc_id left join xd_types ty on ty.id = d.type_id left join users u on u.id = t.created_by`;
export const listTxns = (from?: string, to?: string) =>
  q<Txn>(`select ${TXN} ${TXN_FROM} where ($1::date is null or t.on_date >= $1) and ($2::date is null or t.on_date <= $2) order by t.on_date desc, t.id desc limit 5000`, [from ?? null, to ?? null]);

export async function getShipment(id: string) {
  if (!/^\d{1,12}$/.test(id)) return null;
  const s = await one<Shipment>(`select ${SHIP} from xd_shipments s left join users u on u.id = s.created_by where s.id = $1`, [id]);
  if (!s) return null;
  const [docs, txns] = await Promise.all([q<Doc>(`select ${DOC} ${DOC_FROM} where d.shipment_id = $1 order by ty.position, d.id`, [id]), q<Txn>(`select ${TXN} ${TXN_FROM} where t.shipment_id = $1 and t.doc_id is null order by t.on_date desc, t.id desc`, [id])]);
  return { ...s, docList: docs, other: txns };
}

export const xdRef = (id: string | number) => `XD-${String(id).padStart(4, "0")}`;
/** Days from `today` until the card's next statement date. */
export function daysToStatement(today: string, day: number): number {
  const [y, m, d] = today.split("-").map(Number);
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const thisOne = Math.min(day, last(y, m));
  if (d <= thisOne) return thisOne - d;
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return Math.round((Date.UTC(ny, nm - 1, Math.min(day, last(ny, nm))) - Date.UTC(y, m - 1, d)) / 864e5);
}
