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
export const SUGGESTED_MILESTONES = ["Truck and driver assigned", "Arrived at pickup", "Picked up", "On the way", "At customs / border", "Arrived at delivery", "Delivered"];
export const DEFAULT_MILESTONES = ["Truck and driver assigned", "Picked up", "On the way", "Delivered"];
/** Always the last milestone: it needs a file, and the job cannot be closed without it. */
export const POD = "Proof of delivery";
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

/** One plain line saying who the request is waiting on. */
export function nextStep(r: { status: RfqStatus; vendors: number; replied: number; quoted: number; winner?: string | null; ms_total?: number; ms_done?: number; ms_next?: string | null; problems?: number }): string {
  if (r.status === "pending_award") return "Waiting for a Lead to approve the choice";
  if (r.status === "awarded") return `Waiting for ${r.winner ?? "the vendor"} to confirm the job`;
  if (r.status === "confirmed") {
    if (r.problems) return `Problem reported${r.ms_next ? ` at "${r.ms_next}"` : ""}. Check with the vendor`;
    if (!r.ms_total) return "Job confirmed. Add milestones to track it";
    return r.ms_next ? `Job running, ${r.ms_done} of ${r.ms_total} done. Next: ${r.ms_next}` : "All milestones done. Close the job";
  }
  if (r.status === "done") return "Finished";
  if (r.status === "cancelled") return "Cancelled";
  const left = r.vendors - r.replied;
  if (r.replied === 0) return r.vendors === 1 ? "Waiting for the vendor to reply" : `Waiting for ${r.vendors} vendors to reply`;
  if (left > 0) return r.quoted ? `${r.quoted} quote${r.quoted === 1 ? "" : "s"} in, waiting for ${left} more vendor${left === 1 ? "" : "s"}` : `Waiting for ${left} more vendor${left === 1 ? "" : "s"}`;
  return r.quoted ? "All replies are in. Choose a vendor" : "No vendor can do it. Add more vendors";
}
