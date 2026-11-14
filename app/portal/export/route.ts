import ExcelJS from "exceljs";
import { q } from "@/lib/db";
import { TZ, todayISO } from "@/lib/time";
import { getVendorUser } from "@/lib/vendor-auth";
import { rqRef, type Field } from "@/lib/vendor-labels";

export const dynamic = "force-dynamic";

const stamp = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d)) : "");
const RESULT: Record<string, string> = { open: "Open", won: "Won, to confirm", confirmed: "Job running", done: "Job done", lost: "Not chosen", cancelled: "Cancelled" };

/** The vendor's own Excel file: their requests, their prices and their jobs. Never anything about other vendors. */
export async function GET() {
  const v = await getVendorUser();
  if (!v) return new Response("Sign in first.", { status: 401 });
  const [rows, steps] = await Promise.all([
    q<{ id: string; title: string; fields: Field[]; notes: string; reply_by: string | null; created_at: Date; by: string; state: string; price: string | null; currency: string | null; ready_on: string | null; valid_until: string | null; note: string | null; decline_reason: string | null; quoted_at: Date | null; result: string; job_due: string | null }>(
      `select r.id::text as id, r.title, r.fields, r.notes, r.reply_by::text as reply_by, r.created_at, u.name as by, rv.state, rv.price::text as price, rv.currency, rv.ready_on::text as ready_on, rv.valid_until::text as valid_until,
              rv.note, rv.decline_reason, rv.quoted_at, case when r.awarded_vendor_id = rv.vendor_id then r.job_due::text end as job_due,
              case when r.status = 'cancelled' then 'cancelled' when r.status in ('awarded', 'confirmed', 'done') and r.awarded_vendor_id = rv.vendor_id then (case r.status when 'awarded' then 'won' else r.status end)
                   when r.status in ('awarded', 'confirmed', 'done') then 'lost' else 'open' end as result
         from rfq_vendors rv join rfqs r on r.id = rv.rfq_id join users u on u.id = r.created_by where rv.vendor_id = $1 order by r.id desc`,
      [v.vendor_id],
    ),
    q<{ rfq_id: string; title: string; position: number; step: string; done_at: Date | null; done_by: string | null; done_note: string | null; problem: string | null }>(
      `select r.id::text as rfq_id, r.title, m.position, m.title as step, m.done_at, m.done_by, m.done_note, m.problem
         from job_milestones m join rfqs r on r.id = m.rfq_id where r.awarded_vendor_id = $1 and r.status in ('awarded', 'confirmed', 'done') order by r.id desc, m.position`,
      [v.vendor_id],
    ),
  ]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Shipping Tickets";
  const sheet = (name: string, cols: [string, number][]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map(([header, width]) => ({ header, width }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF11161F" } };
    head.height = 22;
    head.alignment = { vertical: "middle" };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return ws;
  };
  const a = sheet("My requests", [["Request", 11], ["Title", 38], ["Asked by", 18], ["Asked on", 18], ["Reply by", 12], ["Details", 55], ["My reply", 14], ["My price", 12], ["Currency", 10], ["Can do on", 12], ["Valid until", 12], ["Result", 16], ["My notes", 40]]);
  for (const r of rows)
    a.addRow([rqRef(r.id), r.title, r.by, stamp(r.created_at), r.reply_by ?? "", [...r.fields.map((f) => `${f.label}: ${f.value}`), r.notes].filter(Boolean).join("\n"), r.state === "quoted" ? "Quoted" : r.state === "declined" ? "Can't do" : "No reply yet", r.price == null ? "" : Number(r.price), r.price ? (r.currency ?? "") : "", r.ready_on ?? "", r.valid_until ?? "", RESULT[r.result] ?? r.result, r.state === "declined" ? (r.decline_reason ?? "") : (r.note ?? "")]);
  a.getColumn(6).alignment = { wrapText: true, vertical: "top" };
  a.getColumn(8).numFmt = "#,##0.00";
  const b = sheet("My jobs", [["Request", 11], ["Title", 38], ["Step", 7], ["Milestone", 30], ["Status", 12], ["Done on", 18], ["Done by", 20], ["Note", 40], ["Open problem", 40]]);
  for (const s of steps) b.addRow([rqRef(s.rfq_id), s.title, s.position, s.step, s.done_at ? "Done" : s.problem ? "Problem" : "To do", stamp(s.done_at), s.done_by ?? "", s.done_note ?? "", s.problem ?? ""]);
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Shipping Tickets requests ${todayISO()}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
