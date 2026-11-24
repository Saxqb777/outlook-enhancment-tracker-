import ExcelJS from "exceljs";
import { getCurrentUser, getViewer } from "@/lib/auth";
import { xlsxResponse } from "@/lib/rate-excel";
import { todayISO } from "@/lib/time";
import { docsAccess, listTxns, xdRef } from "@/lib/xdocs";
import { period, summarize } from "@/lib/xdocs-view";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const DARK = "FF11161F";
function head(ws: ExcelJS.Worksheet, row: number) {
  const r = ws.getRow(row);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
  r.height = 20;
}

/** The monthly card report, or the list of costs Finance charges to customers, as Excel. */
export async function GET(req: Request) {
  if (!(await getCurrentUser())) return new Response("Sign in first.", { status: 401 });
  const { me } = await getViewer();
  if (!docsAccess(me).view) return new Response("Not found.", { status: 404 });
  const u = new URL(req.url).searchParams;
  const per = period("custom", todayISO(), u.get("from") ?? "", u.get("to") ?? "");
  const txns = (await listTxns(per.from, per.to)).reverse();
  const s = summarize(txns);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Shipping Tickets";
  const money = (ws: ExcelJS.Worksheet, ...cols: number[]) => cols.forEach((c) => (ws.getColumn(c).numFmt = "#,##0.00"));
  if (u.get("kind") === "finance") {
    const ws = wb.addWorksheet("Charge to customers");
    ws.columns = [{ width: 30 }, { width: 13 }, { width: 12 }, { width: 44 }, { width: 18 }, { width: 16 }];
    ws.addRow([`Costs to charge to customers, ${per.from} to ${per.to}`]).font = { bold: true, size: 13 };
    ws.addRow([]);
    ws.addRow(["Customer", "Date", "Shipment", "What", "Card", "Amount (AED)"]);
    head(ws, 3);
    for (const [cust, total, rows] of s.byCustomer) {
      for (const t of rows) ws.addRow([cust, t.on_date, t.shipment_id ? xdRef(t.shipment_id) : "", [t.doc, t.category && !t.doc ? t.category : "", t.description].filter(Boolean).join(" · "), t.card, t.amount]);
      ws.addRow([`Total to charge ${cust}`, "", "", "", "", total]).font = { bold: true };
    }
    ws.addRow([]);
    ws.addRow(["Total to charge to customers", "", "", "", "", s.charge]).font = { bold: true };
    money(ws, 6);
    return xlsxResponse(wb, `Charge to customers ${per.from} to ${per.to}.xlsx`);
  }
  const ws = wb.addWorksheet("Summary");
  ws.columns = [{ width: 30 }, ...s.cards.map(() => ({ width: 18 })), { width: 18 }, { width: 10 }];
  ws.addRow([`Card utilization report, ${per.from} to ${per.to}`]).font = { bold: true, size: 13 };
  ws.addRow([]);
  ws.addRow(["Used for", ...s.cards, "Total (AED)", "Share"]);
  head(ws, 3);
  for (const r of s.matrix) ws.addRow([r.cat, ...r.cells, r.total, s.spent ? `${Math.round((r.total / s.spent) * 100)}%` : ""]);
  ws.addRow(["Total spent", ...s.byCard.map((x) => x[1]), s.spent]).font = { bold: true };
  ws.addRow(["Top-ups received", ...s.byCard.map((x) => x[2]), s.topups]);
  ws.addRow(["To charge to customers", ...s.cards.map(() => ""), s.charge]);
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow(["Prepared by", "", "Checked by", "", "Received by Finance"]);
  ws.addRow([]);
  ws.addRow(["____________________", "", "____________________", "", "____________________"]);
  money(ws, ...s.cards.map((_, i) => i + 2), s.cards.length + 2);
  const tx = wb.addWorksheet("Transactions", { views: [{ state: "frozen", ySplit: 1 }] });
  tx.columns = [["Date", 12], ["Type", 10], ["Used for", 20], ["Details", 44], ["Document", 30], ["Shipment", 11], ["Customer", 28], ["Card", 18], ["Amount (AED)", 15], ["Charge to customer", 18], ["Entered by", 18]].map(([header, width]) => ({ header: header as string, width: width as number }));
  head(tx, 1);
  for (const t of txns) tx.addRow([t.on_date, t.kind === "topup" ? "Top-up" : "Spent", t.category ?? "", t.description, t.doc ?? "", t.shipment_id ? xdRef(t.shipment_id) : "", t.customer, t.card, t.kind === "topup" ? -t.amount : t.amount, t.kind === "spend" && t.charge_customer ? "Yes" : "", t.by ?? ""]);
  tx.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 11 } };
  money(tx, 9);
  return xlsxResponse(wb, `Card report ${per.from} to ${per.to}.xlsx`);
}
