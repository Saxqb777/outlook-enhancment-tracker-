// Shared by the server and the browser: words, lists and the sums for the freight rate book.
export type Mode = "sea" | "road" | "air";
export type Service = "d2d" | "p2p" | "d2p" | "p2d";
export type QuoteState = "quoted" | "declined" | "no_reply";
export type Equip = { type: string; qty: number };
export type UnitRate = { type: string; rate: number };
/** `applies`: the container type a per-container charge is for ("" = every container). Missing on old records: worked out from the label. */
export type Charge = { label: string; basis: "container" | "shipment"; amount: number; currency: string; applies?: string };
export type Fx = Record<string, number>;

export const rtRef = (id: string | number) => `RT-${String(id).padStart(4, "0")}`;
export const MODES: Record<Mode, string> = { sea: "Sea", road: "Road", air: "Air" };
export const SERVICES: Record<Service, string> = { d2d: "Door to Door", p2p: "Port to Port", d2p: "Door to Port", p2d: "Port to Door" };
export const SERVICE_SHORT: Record<Service, string> = { d2d: "DTD", p2p: "PTP", d2p: "DTP", p2d: "PTD" };
export const STATES: Record<QuoteState, string> = { quoted: "Quoted", declined: "Declined", no_reply: "No reply" };
export const INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP", "DTP", "DTD"];
export const EQUIPMENT = ["20FT", "40FT", "40HC", "20FT Reefer", "40FT Reefer", "45HC", "Flatbed", "Curtain side truck", "Reefer truck", "3 ton truck", "7 ton truck", "10 ton truck", "LCL (per CBM)", "Air (per kg)"];
export const CURRENCIES = ["USD", "AED", "EUR", "SAR", "GBP", "CNY", "INR"];

export const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
/** Equipment names typed in different ways still match: "40 HC", "40'HC", "1x40HC" are all 40HC. */
export function normEquip(v: string): string {
  const s = String(v ?? "").toUpperCase().replace(/^\s*\d+\s*[X×]\s*/, "").replace(/['’`]/g, "").replace(/\s+/g, " ").trim();
  if (/^20\s*(FT|DC|GP|DV|STD|DRY)?( DRY)?( CONTAINER)?$/.test(s)) return "20FT";
  if (/^40\s*(HC|HQ|HIGH CUBE)( CONTAINER)?$/.test(s)) return "40HC";
  if (/^40\s*(FT|DC|GP|DV|STD|DRY)?( DRY)?( CONTAINER)?$/.test(s)) return "40FT";
  if (/^45\s*(HC|HQ)?$/.test(s)) return "45HC";
  if (/^20\s*(FT)?\s*(RF|REEFER|RH)$/.test(s)) return "20FT Reefer";
  if (/^40\s*(FT|HC)?\s*(RF|REEFER|RH)$/.test(s)) return "40FT Reefer";
  return EQUIPMENT.find((e) => e.toUpperCase() === s) ?? String(v ?? "").trim().slice(0, 40);
}
export const toAED = (amount: number, currency: string, fx: Fx) => amount * (fx[currency] ?? 1);
export const fromAED = (aed: number, currency: string, fx: Fx) => aed / (fx[currency] || 1);
export const money = (n: number, currency: string) => `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: n % 1 ? 2 : 0 })}`;

/** "Origin charges (40HC)" or "THC 20GP" is for that size only. A label naming no size, or several, is for all. */
export function inferApplies(label: string): string {
  const found = new Set<string>();
  for (const m of String(label ?? "").toUpperCase().matchAll(/(?:^|[^0-9A-Z])((?:20|40|45)\s*['’]?\s*(?:FT|GP|DC|DV|HC|HQ|STD|RF|REEFER|RH)(?:\s*(?:RF|REEFER))?)(?![0-9A-Z])/g)) found.add(normEquip(m[1]));
  return found.size === 1 ? [...found][0] : "";
}
/** The container type this charge is for, or "" when it is for every container. */
export const chargeFor = (c: Charge): string => (c.basis === "shipment" ? "" : c.applies !== undefined ? (c.applies ? normEquip(c.applies) : "") : inferApplies(c.label));
export const basisText = (c: Charge): string => (c.basis === "shipment" ? "per shipment" : chargeFor(c) ? `per ${chargeFor(c)}` : "per container");

type Priced = { currency: string; rates: UnitRate[]; charges: Charge[] };
/** Everything a quote costs for the whole shipment, in AED: freight per unit times quantity, plus the charges that belong to those units. */
export function quoteTotalAED(q: Priced, equipment: Equip[], fx: Fx): { freight: number; charges: number; total: number; complete: boolean } {
  const units = equipment.reduce((n, e) => n + (e.qty || 1), 0) || 1;
  const qtyOf = (type: string) => (equipment.length ? equipment.filter((e) => normEquip(e.type) === type).reduce((n, e) => n + (e.qty || 1), 0) : 1);
  let freight = 0;
  let complete = equipment.length > 0;
  for (const e of equipment) {
    const r = q.rates.find((x) => normEquip(x.type) === normEquip(e.type));
    if (!r || !r.rate) complete = false;
    else freight += toAED(r.rate * (e.qty || 1), q.currency, fx);
  }
  if (!equipment.length) freight = q.rates.reduce((n, r) => n + toAED(r.rate, q.currency, fx), 0);
  const charges = q.charges.reduce((n, c) => {
    const only = chargeFor(c);
    const times = c.basis === "shipment" ? 1 : only ? qtyOf(only) : units;
    return n + toAED(c.amount * times, c.currency || q.currency, fx);
  }, 0);
  return { freight, charges, total: freight + charges, complete: complete || (!equipment.length && q.rates.length > 0) };
}
/** The cost of ONE unit of this type, all in: its freight rate plus the per-container charges that are for it. Per-shipment charges are not spread in. */
export function unitAllInAED(q: Priced, type: string, _equipment: Equip[] | null, fx: Fx): number | null {
  const want = normEquip(type);
  const r = q.rates.find((x) => normEquip(x.type) === want);
  if (!r || !r.rate) return null;
  const per = q.charges.reduce((n, c) => (c.basis === "container" && (!chargeFor(c) || chargeFor(c) === want) ? n + toAED(c.amount, c.currency || q.currency, fx) : n), 0);
  return toAED(r.rate, q.currency, fx) + per;
}
/** Charges made once for the whole shipment (documents, telex release), in AED. */
export const shipmentChargesAED = (q: Priced, fx: Fx): number => q.charges.reduce((n, c) => (c.basis === "shipment" ? n + toAED(c.amount, c.currency || q.currency, fx) : n), 0);
/** Loose text match for places: "jebel ali" finds "Jebel Ali, Dubai" and "JEA / Jebel Ali Port". */
export function placeMatch(needle: string, ...hay: string[]): boolean {
  const words = needle.toLowerCase().split(/[\s,>/-]+/).filter(Boolean);
  if (!words.length) return true;
  const text = hay.join(" ").toLowerCase();
  return words.every((w) => text.includes(w));
}
