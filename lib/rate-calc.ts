// Shared by the server and the browser: words, lists and the sums for the freight rate book.
export type Mode = "sea" | "road" | "air";
export type Service = "d2d" | "p2p" | "d2p" | "p2d";
export type QuoteState = "quoted" | "declined" | "no_reply";
export type Equip = { type: string; qty: number };
export type UnitRate = { type: string; rate: number };
export type Charge = { label: string; basis: "container" | "shipment"; amount: number; currency: string };
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

/** Everything a quote costs for the whole shipment, in AED: freight per unit times quantity, plus charges. */
export function quoteTotalAED(q: { currency: string; rates: UnitRate[]; charges: Charge[] }, equipment: Equip[], fx: Fx): { freight: number; charges: number; total: number; complete: boolean } {
  const units = equipment.reduce((n, e) => n + (e.qty || 1), 0) || 1;
  let freight = 0;
  let complete = equipment.length > 0;
  for (const e of equipment) {
    const r = q.rates.find((x) => normEquip(x.type) === normEquip(e.type));
    if (!r || !r.rate) complete = false;
    else freight += toAED(r.rate * (e.qty || 1), q.currency, fx);
  }
  if (!equipment.length) freight = q.rates.reduce((n, r) => n + toAED(r.rate, q.currency, fx), 0);
  const charges = q.charges.reduce((n, c) => n + toAED(c.amount * (c.basis === "container" ? units : 1), c.currency || q.currency, fx), 0);
  return { freight, charges, total: freight + charges, complete: complete || (!equipment.length && q.rates.length > 0) };
}
/** The cost of ONE unit of this equipment, all in (its freight rate plus its share of the charges), in AED. */
export function unitAllInAED(q: { currency: string; rates: UnitRate[]; charges: Charge[] }, type: string, equipment: Equip[], fx: Fx): number | null {
  const r = q.rates.find((x) => normEquip(x.type) === normEquip(type));
  if (!r || !r.rate) return null;
  const units = equipment.reduce((n, e) => n + (e.qty || 1), 0) || 1;
  const per = q.charges.reduce((n, c) => n + toAED(c.basis === "container" ? c.amount : c.amount / units, c.currency || q.currency, fx), 0);
  return toAED(r.rate, q.currency, fx) + per;
}
/** Loose text match for places: "jebel ali" finds "Jebel Ali, Dubai" and "JEA / Jebel Ali Port". */
export function placeMatch(needle: string, ...hay: string[]): boolean {
  const words = needle.toLowerCase().split(/[\s,>/-]+/).filter(Boolean);
  if (!words.length) return true;
  const text = hay.join(" ").toLowerCase();
  return words.every((w) => text.includes(w));
}
