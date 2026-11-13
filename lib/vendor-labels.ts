// Words and small helpers shared by the team pages, the vendor portal and the server.
export type RfqStatus = "open" | "pending_award" | "awarded" | "confirmed" | "done" | "cancelled";
export type QuoteState = "invited" | "quoted" | "declined";
export type Field = { label: string; value: string };

export const rqRef = (id: string | number) => `RQ-${String(id).padStart(4, "0")}`;
export const RFQ_STATUS: Record<RfqStatus, string> = { open: "Open", pending_award: "Waiting for Lead", awarded: "Awarded", confirmed: "Confirmed", done: "Done", cancelled: "Cancelled" };
export const QUOTE_STATE: Record<QuoteState, string> = { invited: "No reply yet", quoted: "Quoted", declined: "Can't do" };
export const CURRENCIES = ["AED", "USD", "EUR", "SAR"];
export const SERVICES = ["Trucking", "Reefer truck", "Flatbed", "Container haulage", "Sea freight", "Air freight", "Customs clearance", "Warehousing", "Crane / heavy lift", "Courier"];
export const SUGGESTED_FIELDS = ["From", "To", "Cargo", "Weight", "Truck or container type", "Number of trucks", "Pickup date", "Delivery date", "Temperature", "Special handling", "Payment terms"];
export const DEFAULT_FIELDS = ["From", "To", "Cargo", "Truck or container type", "Pickup date"];

export const money = (price: string | number | null, currency: string | null) =>
  price == null ? "" : `${currency ?? ""} ${Number(price).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`.trim();

export function cleanFields(v: unknown): Field[] {
  const out: Field[] = [];
  for (const f of Array.isArray(v) ? v : []) {
    const label = String((f as Field)?.label ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    const value = String((f as Field)?.value ?? "").trim().slice(0, 500);
    if (label && !out.some((x) => x.label.toLowerCase() === label.toLowerCase())) out.push({ label, value });
    if (out.length >= 30) break;
  }
  return out;
}
