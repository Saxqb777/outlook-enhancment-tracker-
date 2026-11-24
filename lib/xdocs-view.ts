// Turns database rows into what the Export Docs screens show.
import { isImage, sizeLabel } from "@/lib/attach-rules";
import { fmtStamp } from "@/lib/time";
import { daysToStatement, xdRef, type Budget, type Card, type Doc, type Shipment, type Txn } from "@/lib/xdocs";

export const shipV = (s: Shipment) => ({ id: s.id, ref: xdRef(s.id), customer: s.customer, country: s.country, invoice_no: s.invoice_no, incoterm: s.incoterm, shipped_on: s.shipped_on, notes: s.notes, docs: s.docs, cost: s.cost, added: fmtStamp(s.created_at) });
export const docV = (d: Doc) => ({ id: d.id, shipment_id: d.shipment_id, type_id: d.type_id, type: d.type, doc_number: d.doc_number, notes: d.notes, name: d.name, size: d.size ? sizeLabel(d.size) : "", view: !!d.mime && (d.mime === "application/pdf" || isImage(d.mime)), cost: d.cost, card_id: d.card_id, card: d.card, paid_on: d.paid_on, category_id: d.category_id, charge_customer: d.charge_customer });
export const cardV = (c: Card) => ({ ...c });
export const budgetV = (b: Budget, today: string) => ({ ...b, days: daysToStatement(today, b.statement_day) });
export const txnV = (t: Txn) => ({ ...t });

/** The start and end of a report period. "cycle" = the card statement month ending on `day`. */
export function period(kind: string, today: string, from?: string, to?: string, day = 18): { from: string; to: string; label: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [y, m, d] = today.split("-").map(Number);
  const ok = (v?: string) => !!v && /^\d{4}-\d\d-\d\d$/.test(v);
  const name = (yy: number, mm: number) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(yy, mm - 1, 1)));
  if (kind === "custom" && ok(from) && ok(to) && from! <= to!) return { from: from!, to: to!, label: `${from} to ${to}` };
  if (kind === "last") {
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    return { from: iso(new Date(Date.UTC(py, pm - 1, 1))), to: iso(new Date(Date.UTC(py, pm, 0))), label: name(py, pm) };
  }
  if (kind === "cycle") {
    // The statement period that today falls in: the day after the last statement, up to the next one.
    const end = d <= day ? new Date(Date.UTC(y, m - 1, day)) : new Date(Date.UTC(y, m, day));
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, day + 1));
    return { from: iso(start), to: iso(end), label: `Statement period ${iso(start)} to ${iso(end)}` };
  }
  if (/^\d{4}-\d\d$/.test(kind)) {
    const [yy, mm] = kind.split("-").map(Number);
    return { from: `${kind}-01`, to: iso(new Date(Date.UTC(yy, mm, 0))), label: name(yy, mm) };
  }
  return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))), label: name(y, m) };
}

export type Summary = { spent: number; topups: number; charge: number; byCat: [string, number][]; byCard: [string, number, number][]; byCustomer: [string, number, Txn[]][]; matrix: { cat: string; cells: number[]; total: number }[]; cards: string[] };
export function summarize(txns: Txn[]): Summary {
  const spend = txns.filter((t) => t.kind === "spend");
  const sum = (xs: Txn[]) => Math.round(xs.reduce((n, t) => n + t.amount, 0) * 100) / 100;
  const group = <K,>(xs: Txn[], key: (t: Txn) => K) => { const m = new Map<K, Txn[]>(); for (const t of xs) m.set(key(t), [...(m.get(key(t)) ?? []), t]); return m; };
  const cats = [...group(spend, (t) => t.category ?? "Not set").entries()].map(([k, v]) => [k, sum(v)] as [string, number]).sort((a, b) => b[1] - a[1]);
  const cards = [...new Set(txns.map((t) => t.card))].sort();
  const charged = spend.filter((t) => t.charge_customer);
  return {
    spent: sum(spend), topups: sum(txns.filter((t) => t.kind === "topup")), charge: sum(charged), byCat: cats,
    byCard: cards.map((c) => [c, sum(spend.filter((t) => t.card === c)), sum(txns.filter((t) => t.kind === "topup" && t.card === c))] as [string, number, number]),
    byCustomer: [...group(charged, (t) => t.customer || "Customer not set").entries()].map(([k, v]) => [k, sum(v), v] as [string, number, Txn[]]).sort((a, b) => a[0].localeCompare(b[0])),
    matrix: cats.map(([cat, total]) => ({ cat, total, cells: cards.map((c) => sum(spend.filter((t) => (t.category ?? "Not set") === cat && t.card === c))) })), cards,
  };
}
