// Excel files for the rate book: a flat list of quotations, one enquiry's comparison, and the import template.
import ExcelJS from "exceljs";
import { fromAED, MODES, normEquip, quoteTotalAED, rtRef, SERVICES, STATES, toAED, unitAllInAED, type Fx } from "@/lib/rate-calc";
import type { RateQuote, RateRequest } from "@/lib/rates";

const DARK = "FF11161F";
const GREEN = "FFDFF3EA";
function head(ws: ExcelJS.Worksheet, row = 1) {
  const r = ws.getRow(row);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
  r.height = 22;
  r.alignment = { vertical: "middle", wrapText: true };
}
const xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const xlsxResponse = async (wb: ExcelJS.Workbook, filename: string) =>
  new Response(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer), { headers: { "Content-Type": xlsx, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });

/** One row per quotation per container type: what the search shows. */
export function ratesWorkbook(reqs: RateRequest[], quotes: RateQuote[], fx: Fx, keys: Set<string> | null, title: string, today: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Shipping Tickets";
  const ws = wb.addWorksheet("Rates", { views: [{ state: "frozen", ySplit: 1 }] });
  const cols: [string, number][] = [["Date", 12], ["Enquiry", 10], ["Supplier", 26], ["From", 20], ["Origin country", 14], ["Origin port", 16], ["To", 20], ["Destination country", 16], ["Destination port", 16], ["Commodity", 26], ["Mode", 8], ["Service", 14], ["Incoterm", 10], ["Container / truck", 16], ["Rate", 12], ["Currency", 9], ["Rate in AED", 13], ["All in, AED", 13], ["Additional charges", 40], ["Transit", 18], ["Free time", 12], ["Valid until", 12], ["Status", 10], ["Agreed", 11], ["Carrier", 12], ["Remarks", 50]];
  ws.columns = cols.map(([header, width]) => ({ header, width }));
  head(ws);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  const byId = new Map(reqs.map((r) => [r.id, r]));
  for (const q of quotes) {
    const r = byId.get(q.request_id);
    if (!r || q.state !== "quoted") continue;
    for (const u of q.rates) {
      if (keys && !keys.has(`${q.id}:${normEquip(u.type)}`) && !keys.has(`${q.id}:${u.type}`)) continue;
      ws.addRow([q.quoted_on, rtRef(r.id), q.supplier, r.origin, r.origin_country, r.origin_port, r.destination, r.destination_country, r.destination_port, r.commodity, MODES[r.mode], SERVICES[r.service], r.incoterm, normEquip(u.type), u.rate, q.currency, Math.round(toAED(u.rate, q.currency, fx) * 100) / 100, Math.round((unitAllInAED(q, u.type, r.equipment, fx) ?? 0) * 100) / 100, q.charges.map((c) => `${c.label}: ${c.currency} ${c.amount} per ${c.basis}`).join("; "), q.transit, q.free_time, q.valid_until ?? "", !q.valid_until || q.valid_until >= today ? "Active" : "Expired", r.awarded_quote_id === q.id ? "Awarded" : q.negotiated ? "Negotiated" : "", q.carrier, [q.remarks, q.exclusions && `Not included: ${q.exclusions}`].filter(Boolean).join(" | ")]);
    }
  }
  for (const c of [15, 17, 18]) ws.getColumn(c).numFmt = "#,##0.00";
  const info = wb.addWorksheet("About");
  info.columns = [{ width: 22 }, { width: 70 }];
  info.addRows([["Freight rates", title || "All quotations"], ["Exported on", today], ["Rows", ws.rowCount - 1], ["Exchange rates", Object.entries(fx).filter(([k]) => k !== "AED").map(([k, v]) => `1 ${k} = ${v} AED`).join(", ")], ["All in", "Rate for one unit plus its share of the additional charges, in AED."]]);
  info.getColumn(1).font = { bold: true };
  return wb;
}

/** One enquiry laid out like a comparison sheet: charge lines down, suppliers across, lowest marked, totals and the award. */
export function comparisonWorkbook(r: RateRequest & { quotes: RateQuote[] }, fx: Fx) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Shipping Tickets";
  const ws = wb.addWorksheet("Comparison");
  const quoted = r.quotes.filter((q) => q.state === "quoted");
  const others = r.quotes.filter((q) => q.state !== "quoted");
  const totals = new Map(quoted.map((q) => [q.id, quoteTotalAED(q, r.equipment, fx)]));
  const ranked = [...quoted].sort((a, b) => totals.get(a.id)!.total - totals.get(b.id)!.total);
  const all = [...ranked, ...others];
  const N = all.length;
  ws.columns = [{ width: 6 }, { width: 42 }, { width: 16 }, ...all.map(() => ({ width: 20 })), { width: 24 }, { width: 18 }];
  ws.mergeCells(1, 1, 1, 5 + N);
  ws.getCell(1, 1).value = `${rtRef(r.id)} | Freight Rate Comparison | ${r.equipment.map((e) => `${e.qty} × ${e.type}`).join(" + ")} | ${r.commodity}`;
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.getRow(1).height = 24;
  ws.addRow(["", `${[r.origin, r.origin_port, r.origin_country].filter(Boolean).join(", ")}  →  ${[r.destination, r.destination_port, r.destination_country].filter(Boolean).join(", ")}  |  ${MODES[r.mode]}  |  ${SERVICES[r.service]}${r.incoterm ? `  |  ${r.incoterm}` : ""}  |  asked ${r.requested_on}`]);
  ws.addRow([]);
  ws.addRow(["S.No", "Description", "Charge basis", ...all.map((q) => q.supplier), "Lowest provider", "Lowest (AED)"]);
  head(ws, 4);
  let n = 0;
  const line = (label: string, basis: string, vals: (number | null)[], texts: string[]) => {
    const xs = vals.filter((v): v is number => v != null && v > 0);
    const min = xs.length ? Math.min(...xs) : null;
    const row = ws.addRow([++n, label, basis, ...texts, min != null ? all[vals.indexOf(min)].supplier : "", min != null ? Math.round(min * 100) / 100 : ""]);
    vals.forEach((v, i) => {
      if (min != null && v === min && xs.length > 1) row.getCell(4 + i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
      row.getCell(4 + i).alignment = { horizontal: "right" };
    });
  };
  for (const e of r.equipment) {
    const vals = all.map((q) => { const u = q.rates.find((x) => normEquip(x.type) === normEquip(e.type)); return q.state === "quoted" && u ? toAED(u.rate, q.currency, fx) : null; });
    line(`Freight, ${e.type}${e.qty > 1 ? ` × ${e.qty}` : ""}`, "Per container", vals, all.map((q) => { const u = q.rates.find((x) => normEquip(x.type) === normEquip(e.type)); return q.state !== "quoted" ? (q.state === "declined" ? "Declined" : "Not quoted") : u ? `${q.currency} ${u.rate.toLocaleString("en-US")}` : "Not quoted"; }));
  }
  const labels = [...new Map(quoted.flatMap((q) => q.charges).map((c) => [c.label.toLowerCase(), c])).values()];
  for (const c of labels) {
    const cell = (q: RateQuote) => q.charges.find((x) => x.label.toLowerCase() === c.label.toLowerCase());
    line(c.label, c.basis === "container" ? "Per container" : "Per shipment", all.map((q) => { const x = cell(q); return x ? toAED(x.amount, x.currency, fx) : null; }), all.map((q) => { const x = cell(q); return x ? `${x.currency} ${x.amount.toLocaleString("en-US")}` : ""; }));
  }
  const sum = (label: string, f: (q: RateQuote) => number | string) => {
    const row = ws.addRow(["", label, "", ...all.map((q) => (q.state === "quoted" ? f(q) : ""))]);
    row.font = { bold: true };
    row.eachCell((c, col) => { if (col >= 4) { c.numFmt = "#,##0.00"; c.alignment = { horizontal: "right" }; } });
    return row;
  };
  ws.addRow([]);
  sum("Total freight (AED)", (q) => Math.round(totals.get(q.id)!.freight * 100) / 100);
  sum("Total additional charges (AED)", (q) => Math.round(totals.get(q.id)!.charges * 100) / 100);
  const tot = sum("Total cost, whole shipment (AED)", (q) => Math.round(totals.get(q.id)!.total * 100) / 100);
  if (ranked.length > 1) tot.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
  sum("Total cost, whole shipment (USD)", (q) => Math.round(fromAED(totals.get(q.id)!.total, "USD", fx) * 100) / 100);
  ws.addRow(["", "Transit time", "", ...all.map((q) => q.transit)]);
  ws.addRow(["", "Free time", "", ...all.map((q) => q.free_time)]);
  ws.addRow(["", "Rate valid until", "", ...all.map((q) => q.valid_until ?? "")]);
  ws.addRow(["", "Carrier", "", ...all.map((q) => q.carrier)]);
  ws.addRow(["", "Remarks", "", ...all.map((q) => (q.state === "quoted" ? [q.remarks, q.exclusions && `Not included: ${q.exclusions}`].filter(Boolean).join(" | ") : `${STATES[q.state]}${q.decline_reason ? `: ${q.decline_reason}` : ""}`))]).alignment = { wrapText: true, vertical: "top" };
  ws.addRow([]);
  const won = r.quotes.find((q) => q.id === r.awarded_quote_id);
  const wonTotal = won ? (totals.get(won.id)?.total ?? 0) : 0;
  const facts: [string, string | number][] = [
    ["AED per USD", fx.USD],
    ["No. of containers", r.equipment.reduce((a, e) => a + e.qty, 0)],
    ...(ranked.length > 1 ? ([["Savings vs highest quote (AED)", Math.round((totals.get(ranked[ranked.length - 1].id)!.total - totals.get(ranked[0].id)!.total) * 100) / 100]] as [string, number][]) : []),
    ...(won ? ([["Awarded provider", won.supplier], ["Awarded total cost (AED)", Math.round(wonTotal * 100) / 100], ["Awarded total cost (USD)", Math.round(fromAED(wonTotal, "USD", fx) * 100) / 100], [`PO value incl. ${r.po_buffer_pct}% buffer (AED)`, Math.round(wonTotal * (1 + r.po_buffer_pct / 100) * 100) / 100], ["Reason", r.award_reason ?? ""], ["PR", r.pr_number ?? ""]] as [string, string | number][]) : ([["Awarded provider", "Not awarded yet"]] as [string, string][])),
  ];
  for (const [k, v] of facts) {
    const row = ws.addRow(["", k, v]);
    row.getCell(2).font = { bold: true };
    if (typeof v === "number") row.getCell(3).numFmt = "#,##0.00";
  }
  return wb;
}

export function templateWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Rates");
  const cols = ["Date", "Supplier", "From", "Origin country", "Origin port", "To", "Destination country", "Destination port", "Commodity", "Mode", "Container", "Qty", "Service", "Incoterm", "Rate", "Currency", "Additional charges", "Transit", "Validity", "Remarks"];
  ws.columns = cols.map((header) => ({ header, width: Math.max(12, header.length + 4) }));
  head(ws);
  ws.addRow(["2026-10-24", "Example Forwarder LLC", "Yangzhou", "China", "Shanghai", "Al Ain", "UAE", "Jebel Ali", "Ethyl Formate (DG)", "Sea", "40HC", 1, "Door to Door", "DTD", 16370, "USD", "", "30 to 35 days", "2026-11-30", "All in. Delete this example row."]);
  return wb;
}
