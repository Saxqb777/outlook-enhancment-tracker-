import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { TZ, todayISO } from "@/lib/time";
import { QUOTE_STATE, RFQ_STATUS, rqRef, type Field, type QuoteState, type RfqStatus } from "@/lib/vendor-labels";

export const dynamic = "force-dynamic";

const day = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" }).format(new Date(d)) : "");

/** Excel file of every vendor request and every quote on it. Team only. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const [rfqs, quotes, vendors] = await Promise.all([
    q<{ id: string; title: string; fields: Field[]; notes: string; status: RfqStatus; reply_by: string | null; created_at: Date; by: string; winner: string | null; win_price: string | null; win_currency: string | null; vendors: number; quoted: number; case_id: string | null }>(
      `select r.id::text as id, r.title, r.fields, r.notes, r.status, r.reply_by::text as reply_by, r.created_at, u.name as by, r.case_id::text as case_id,
              case when r.status in ('awarded', 'confirmed', 'done') then v.name end as winner,
              case when r.status in ('awarded', 'confirmed', 'done') then w.price::text end as win_price, w.currency as win_currency,
              (select count(*)::int from rfq_vendors x where x.rfq_id = r.id) as vendors,
              (select count(*)::int from rfq_vendors x where x.rfq_id = r.id and x.state = 'quoted') as quoted
         from rfqs r join users u on u.id = r.created_by left join vendors v on v.id = r.awarded_vendor_id
         left join rfq_vendors w on w.rfq_id = r.id and w.vendor_id = r.awarded_vendor_id where not r.test order by r.id desc`,
    ),
    q<{ rfq_id: string; title: string; vendor: string; state: QuoteState; price: string | null; currency: string | null; ready_on: string | null; valid_until: string | null; note: string | null; decline_reason: string | null; quoted_at: Date | null; won: boolean; changes: number }>(
      `select r.id::text as rfq_id, r.title, v.name as vendor, rv.state, rv.price::text as price, rv.currency, rv.ready_on::text as ready_on, rv.valid_until::text as valid_until, rv.note, rv.decline_reason, rv.quoted_at,
              (r.awarded_vendor_id = rv.vendor_id and r.status in ('awarded', 'confirmed', 'done')) as won,
              greatest((select count(*)::int from rfq_quotes h where h.rfq_id = rv.rfq_id and h.vendor_id = rv.vendor_id) - 1, 0) as changes
         from rfq_vendors rv join rfqs r on r.id = rv.rfq_id join vendors v on v.id = rv.vendor_id where not r.test order by r.id desc, rv.price nulls last`,
    ),
    q<{ name: string; services: string[]; areas: string; phone: string; status: string; people: number; asked: number; quoted: number; won: number }>(
      `select v.name, v.services, v.areas, v.phone, v.status,
              (select count(*)::int from vendor_users u where u.vendor_id = v.id and u.status = 'active') as people,
              (select count(*)::int from rfq_vendors rv where rv.vendor_id = v.id) as asked,
              (select count(*)::int from rfq_vendors rv where rv.vendor_id = v.id and rv.state = 'quoted') as quoted,
              (select count(*)::int from rfqs r where r.awarded_vendor_id = v.id and r.status in ('awarded', 'confirmed', 'done')) as won
         from vendors v where not v.test order by lower(v.name)`,
    ),
  ]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Agthia Enhancements";
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
  const num = (v: string | null) => (v == null ? "" : Number(v));
  const a = sheet("Requests", [["Request", 11], ["Title", 40], ["Status", 16], ["Asked by", 18], ["Asked on", 13], ["Reply by", 13], ["Details", 60], ["Vendors asked", 14], ["Quotes", 9], ["Awarded to", 24], ["Awarded price", 14], ["Currency", 10], ["Case", 10]]);
  for (const r of rfqs)
    a.addRow([rqRef(r.id), r.title, RFQ_STATUS[r.status], r.by, day(r.created_at), r.reply_by ?? "", [...r.fields.map((f) => `${f.label}: ${f.value}`), r.notes].filter(Boolean).join("\n"), r.vendors, r.quoted, r.winner ?? "", num(r.win_price), r.win_price ? (r.win_currency ?? "") : "", r.case_id ? `AE-${r.case_id.padStart(4, "0")}` : ""]);
  a.getColumn(7).alignment = { wrapText: true, vertical: "top" };
  const b = sheet("Quotes", [["Request", 11], ["Title", 36], ["Vendor", 26], ["Reply", 14], ["Price", 13], ["Currency", 10], ["Can do on", 13], ["Valid until", 13], ["Result", 12], ["Price changes", 13], ["Replied on", 13], ["Notes", 50]]);
  for (const x of quotes) b.addRow([rqRef(x.rfq_id), x.title, x.vendor, QUOTE_STATE[x.state], num(x.price), x.price ? (x.currency ?? "") : "", x.ready_on ?? "", x.valid_until ?? "", x.won ? "Won" : "", x.changes || "", day(x.quoted_at), x.state === "declined" ? `Can't do: ${x.decline_reason ?? ""}` : (x.note ?? "")]);
  b.getColumn(5).numFmt = "#,##0.00";
  a.getColumn(11).numFmt = "#,##0.00";
  const c = sheet("Vendors", [["Vendor", 28], ["What they do", 40], ["Areas", 24], ["Phone", 18], ["Access", 10], ["People", 9], ["Requests sent", 14], ["Quoted", 9], ["Won", 8]]);
  for (const v of vendors) c.addRow([v.name, v.services.join(", "), v.areas, v.phone, v.status === "active" ? "On" : "Off", v.people, v.asked, v.quoted, v.won]);
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Agthia vendor quotes ${todayISO()}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
