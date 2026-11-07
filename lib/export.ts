// Builds the Excel export: Summary, Cases, Points, History (optional) and Emails (optional).
import ExcelJS from "exceljs";
import type { User } from "@/lib/auth";
import { q } from "@/lib/db";
import { caseRef, PRIORITY_LABEL, STATUS_LABEL, type Priority, type Status } from "@/lib/status";
import { diffDays, TZ, todayISO } from "@/lib/time";

type CaseRow = {
  id: string;
  subject: string;
  summary: string;
  from_name: string;
  from_email: string;
  company: string;
  priority: Priority;
  deadline: string | null;
  created_at: Date;
  owner: string;
  replies: number;
  last_at: Date | null;
};
type PointRow = {
  id: string;
  case_id: string;
  text: string;
  status: Status;
  wait_reason: string | null;
  due: string | null;
  email_pos: number | null;
  last_note: string | null;
  last_at: Date | null;
  approved_at: Date | null;
};
type EventRow = {
  created_at: Date;
  case_id: string;
  point_id: string;
  kind: "created" | "status" | "update" | "remark" | "due" | "reopen" | "reply";
  text: string | null;
  status: Status | null;
  due: string | null;
  name: string | null;
  email_pos: number | null;
};
type EmailRow = {
  case_id: string;
  position: number;
  from_name: string;
  from_email: string;
  email_sent: string;
  created_at: Date;
  change_note: string | null;
  body: string;
  added_by: string | null;
};

export type ExportOptions = { history: boolean; emails: boolean; filters: string; origin: string; exportedBy: string };

// ------------------------------------------------------------------ look

const INK = "FF11161F";
const HAIR = "FFDCE0E6";
const FONT = "Calibri";
const STATUS_STYLE: Record<Status, { fill: string; font: string; bold?: boolean }> = {
  todo: { fill: "FFF1F2F4", font: "FF4B5262" },
  progress: { fill: "FFE7EDFD", font: "FF2445B8" },
  wait: { fill: "FFFBF0DA", font: "FF7A4F04" },
  done: { fill: "FFE2F4EC", font: "FF0B6B4C" },
  approved: { fill: INK, font: "FFFFFFFF", bold: true },
};

/** A wall-clock time in the team's time zone, stored so Excel shows exactly that time. */
function local(ts: Date | string | null): Date | null {
  if (!ts) return null;
  const d = new Date(ts);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute));
}
function day(iso: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const emailName = (pos: number | null) => (pos === null ? "Added by hand" : pos === 0 ? "Original" : `Reply ${pos}`);
const clipCell = (s: string, max = 32000) => (s.length > max ? `${s.slice(0, max)}\n… (cut here; open the case to read the rest)` : s);

type Col = { header: string; key: string; width: number; wrap?: boolean; fmt?: string; align?: "left" | "center" | "right" };

function sheet(wb: ExcelJS.Workbook, name: string, cols: Col[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1, xSplit: 0 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  ws.columns = cols.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    style: {
      font: { name: FONT, size: 11 },
      alignment: { vertical: "top", wrapText: !!c.wrap, horizontal: c.align },
      ...(c.fmt ? { numFmt: c.fmt } : {}),
    },
  }));
  const head = ws.getRow(1);
  head.height = 24;
  head.eachCell((cell) => {
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
  });
  return ws;
}

function finish(ws: ExcelJS.Worksheet, cols: number) {
  const last = Math.max(ws.rowCount, 1);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: cols } };
  for (let r = 2; r <= last; r++) {
    ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { bottom: { style: "thin", color: { argb: HAIR } } };
    });
  }
}

function link(cell: ExcelJS.Cell, text: string, url: string) {
  cell.value = { text, hyperlink: url, tooltip: "Open this case in Agthia Enhancements" };
  cell.font = { name: FONT, size: 11, color: { argb: "FF2F5BEA" }, underline: true };
}

function statusCell(cell: ExcelJS.Cell, s: Status) {
  const st = STATUS_STYLE[s];
  cell.value = STATUS_LABEL[s];
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: st.fill } };
  cell.font = { name: FONT, size: 11, color: { argb: st.font }, bold: !!st.bold };
}

// ------------------------------------------------------------------ data + workbook

export async function buildWorkbook(me: User, requested: string[], opts: ExportOptions): Promise<{ buffer: Buffer; filename: string; count: number }> {
  const today = todayISO();
  const scope = me.role === "member" ? me.id : null;
  const cases = await q<CaseRow>(
    `select c.id::text as id, c.subject, c.summary, c.from_name, c.from_email, c.company, c.priority, c.deadline::text as deadline,
            c.created_at, u.name as owner,
            (select count(*)::int from case_emails e where e.case_id = c.id and e.position > 0) as replies,
            greatest(c.updated_at, (select max(x.created_at) from point_events x join points p on p.id = x.point_id where p.case_id = c.id)) as last_at
       from cases c join users u on u.id = c.owner_id
      where c.id = any($1::bigint[]) and ($2::uuid is null or c.owner_id = $2)
      order by c.id`,
    [requested, scope],
  );
  const ids = cases.map((c) => c.id);
  const [points, events, emails] = await Promise.all([
    q<PointRow>(
      `select p.id::text as id, p.case_id::text as case_id, p.text, p.status, p.wait_reason, p.due::text as due, e.position as email_pos,
              (select x.text from point_events x where x.point_id = p.id and x.kind in ('update', 'remark', 'reply') order by x.created_at desc limit 1) as last_note,
              (select max(x.created_at) from point_events x where x.point_id = p.id) as last_at,
              (select max(x.created_at) from point_events x where x.point_id = p.id and x.kind = 'status' and x.status = 'approved') as approved_at
         from points p left join case_emails e on e.id = p.email_id
        where p.case_id = any($1::bigint[])
        order by p.case_id, p.position, p.id`,
      [ids],
    ),
    opts.history
      ? q<EventRow>(
          `select x.created_at, p.case_id::text as case_id, p.id::text as point_id, x.kind, x.text, x.status, x.due::text as due,
                  u.name, e.position as email_pos
             from point_events x join points p on p.id = x.point_id
             left join users u on u.id = x.user_id left join case_emails e on e.id = x.email_id
            where p.case_id = any($1::bigint[])
            order by p.case_id, x.created_at, x.id`,
          [ids],
        )
      : Promise.resolve([] as EventRow[]),
    opts.emails
      ? q<EmailRow>(
          `select e.case_id::text as case_id, e.position, e.from_name, e.from_email, e.email_sent, e.created_at, e.change_note, e.body, u.name as added_by
             from case_emails e left join users u on u.id = e.added_by
            where e.case_id = any($1::bigint[])
            order by e.case_id, e.position`,
          [ids],
        )
      : Promise.resolve([] as EmailRow[]),
  ]);

  const caseUrl = (id: string) => `${opts.origin}/cases/${id}`;
  const byCase = new Map<string, PointRow[]>();
  for (const p of points) byCase.set(p.case_id, [...(byCase.get(p.case_id) ?? []), p]);
  const numberOf = new Map<string, number>();
  for (const list of byCase.values()) list.forEach((p, i) => numberOf.set(p.id, i + 1));
  const pointById = new Map(points.map((p) => [p.id, p]));
  const subjectOf = new Map(cases.map((c) => [c.id, c.subject]));
  const ownerOf = new Map(cases.map((c) => [c.id, c.owner]));
  const isOpen = (s: Status) => s !== "done" && s !== "approved";
  const lateBy = (p: PointRow) => (isOpen(p.status) && p.due ? -diffDays(p.due, today) : 0);
  const closed = (id: string) => {
    const l = byCase.get(id) ?? [];
    return l.length > 0 && l.every((p) => p.status === "approved");
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Agthia Enhancements";
  wb.created = new Date();

  // ---------------- Summary
  const sum = wb.addWorksheet("Summary", { properties: { tabColor: { argb: INK } }, pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  sum.columns = [{ width: 30 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 22 }, { width: 14 }];
  const title = sum.addRow(["Agthia Enhancements · Case export"]);
  title.font = { name: FONT, size: 16, bold: true };
  title.height = 26;
  const now = local(new Date())!;
  const stamp = `${now.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][now.getUTCMonth()]} ${now.getUTCFullYear()}, ${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  sum.addRow([`Exported by ${opts.exportedBy} on ${stamp} (UAE time)`]).font = { name: FONT, size: 11, color: { argb: "FF5A6273" } };
  sum.addRow([`${cases.length} case${cases.length === 1 ? "" : "s"} included. ${opts.filters}`.trim()]).font = { name: FONT, size: 11, color: { argb: "FF5A6273" } };
  sum.addRow([]);

  const headRow = (vals: string[]) => {
    const r = sum.addRow(vals);
    r.height = 22;
    r.eachCell((cell) => {
      cell.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
      cell.alignment = { vertical: "middle" };
    });
  };
  const bodyRow = (vals: (string | number)[], bold = false) => {
    const r = sum.addRow(vals);
    r.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > vals.length) return;
      cell.font = { name: FONT, size: 11, bold };
      cell.border = { bottom: { style: "thin", color: { argb: HAIR } } };
    });
  };
  const count = (s: Status) => points.filter((p) => p.status === s).length;
  const late = points.filter((p) => lateBy(p) > 0);
  headRow(["Totals", "Count"]);
  bodyRow(["Cases", cases.length], true);
  bodyRow(["Open cases", cases.filter((c) => !closed(c.id)).length]);
  bodyRow(["Closed cases (all points approved)", cases.filter((c) => closed(c.id)).length]);
  bodyRow(["Points", points.length], true);
  bodyRow(["To do", count("todo")]);
  bodyRow(["In progress", count("progress")]);
  bodyRow(["Waiting", count("wait")]);
  bodyRow(["Done, needs review", count("done")]);
  bodyRow(["Approved", count("approved")]);
  bodyRow(["Past due (open points)", late.length], late.length > 0);
  if (late.length) sum.getRow(sum.rowCount).getCell(2).font = { name: FONT, size: 11, bold: true, color: { argb: "FFC62828" } };
  sum.addRow([]);

  const people = [...new Set(cases.map((c) => c.owner))].sort();
  headRow(["By person", "Cases", "Open points", "Past due", "Done, needs review", "Approved"]);
  for (const name of people) {
    const theirs = points.filter((p) => ownerOf.get(p.case_id) === name);
    bodyRow([
      name,
      cases.filter((c) => c.owner === name).length,
      theirs.filter((p) => isOpen(p.status)).length,
      theirs.filter((p) => lateBy(p) > 0).length,
      theirs.filter((p) => p.status === "done").length,
      theirs.filter((p) => p.status === "approved").length,
    ]);
  }
  sum.addRow([]);
  headRow(["Tabs in this file", ""]);
  const tabs: [string, string][] = [
    ["Cases", "One row per case, with its progress and next deadline"],
    ["Points", "One row per point: status, deadline, days late, latest update"],
  ];
  if (opts.history) tabs.push(["Change log", "Every update, remark, status change, deadline change and reply, in order"]);
  if (opts.emails) tabs.push(["Emails", "Every email on each case (original and replies) with its text"]);
  for (const [t, d] of tabs) bodyRow([t, d]);
  sum.addRow([]);
  sum.addRow(["Tip: every tab has filters in the header row. Case IDs link to the case in the app."]).font = { name: FONT, size: 10, italic: true, color: { argb: "FF868D9B" } };

  // ---------------- Cases
  const caseCols: Col[] = [
    { header: "Case ID", key: "id", width: 11 },
    { header: "Title", key: "subject", width: 46, wrap: true },
    { header: "From", key: "from", width: 22, wrap: true },
    { header: "Company", key: "company", width: 22, wrap: true },
    { header: "Owner", key: "owner", width: 18 },
    { header: "Priority", key: "priority", width: 10 },
    { header: "State", key: "state", width: 10 },
    { header: "Case deadline", key: "deadline", width: 14, fmt: "d mmm yyyy" },
    { header: "Next point deadline", key: "next", width: 18, fmt: "d mmm yyyy" },
    { header: "Points", key: "points", width: 8, align: "right" },
    { header: "Approved", key: "approved", width: 10, align: "right" },
    { header: "Open", key: "open", width: 8, align: "right" },
    { header: "Past due", key: "late", width: 9, align: "right" },
    { header: "Emails", key: "emails", width: 18 },
    { header: "Added on", key: "added", width: 17, fmt: "d mmm yyyy hh:mm" },
    { header: "Last activity", key: "last", width: 17, fmt: "d mmm yyyy hh:mm" },
    { header: "Summary", key: "summary", width: 70, wrap: true },
  ];
  const cs = sheet(wb, "Cases", caseCols);
  for (const c of cases) {
    const list = byCase.get(c.id) ?? [];
    const open = list.filter((p) => isOpen(p.status));
    const next = open.map((p) => p.due).filter(Boolean).sort()[0] ?? null;
    const lateN = list.filter((p) => lateBy(p) > 0).length;
    const row = cs.addRow({
      id: caseRef(c.id),
      subject: c.subject,
      from: c.from_name || c.from_email,
      company: c.company,
      owner: c.owner,
      priority: PRIORITY_LABEL[c.priority],
      state: closed(c.id) ? "Closed" : "Open",
      deadline: day(c.deadline),
      next: day(next),
      points: list.length,
      approved: list.filter((p) => p.status === "approved").length,
      open: open.length,
      late: lateN || null,
      emails: c.replies ? `Original + ${c.replies} repl${c.replies === 1 ? "y" : "ies"}` : "Original",
      added: local(c.created_at),
      last: local(c.last_at),
      summary: c.summary,
    });
    link(row.getCell("id"), caseRef(c.id), caseUrl(c.id));
    if (c.priority === "high") row.getCell("priority").font = { name: FONT, size: 11, bold: true };
    if (closed(c.id)) row.getCell("state").font = { name: FONT, size: 11, color: { argb: "FF0B6B4C" } };
    if (lateN) row.getCell("late").font = { name: FONT, size: 11, bold: true, color: { argb: "FFC62828" } };
  }
  finish(cs, caseCols.length);

  // ---------------- Points
  const pointCols: Col[] = [
    { header: "Case ID", key: "case", width: 11 },
    { header: "Case title", key: "subject", width: 34, wrap: true },
    { header: "Point #", key: "n", width: 8, align: "center" },
    { header: "Point", key: "text", width: 50, wrap: true },
    { header: "Status", key: "status", width: 13 },
    { header: "Deadline", key: "due", width: 13, fmt: "d mmm yyyy" },
    { header: "Days late", key: "late", width: 10, align: "right" },
    { header: "Waiting on", key: "wait", width: 26, wrap: true },
    { header: "Came from", key: "from", width: 14 },
    { header: "Owner", key: "owner", width: 18 },
    { header: "Latest update or remark", key: "note", width: 50, wrap: true },
    { header: "Last change", key: "last", width: 17, fmt: "d mmm yyyy hh:mm" },
    { header: "Approved on", key: "approved", width: 15, fmt: "d mmm yyyy" },
  ];
  const ps = sheet(wb, "Points", pointCols);
  for (const p of points) {
    const lb = lateBy(p);
    const row = ps.addRow({
      case: caseRef(p.case_id),
      subject: subjectOf.get(p.case_id) ?? "",
      n: numberOf.get(p.id),
      text: p.text,
      due: day(p.due),
      late: lb > 0 ? lb : null,
      wait: p.status === "wait" ? (p.wait_reason ?? "") : "",
      from: emailName(p.email_pos),
      owner: ownerOf.get(p.case_id) ?? "",
      note: p.last_note ?? "",
      last: local(p.last_at),
      approved: p.approved_at && p.status === "approved" ? local(p.approved_at) : null,
    });
    link(row.getCell("case"), caseRef(p.case_id), caseUrl(p.case_id));
    statusCell(row.getCell("status"), p.status);
    if (lb > 0) {
      row.getCell("late").font = { name: FONT, size: 11, bold: true, color: { argb: "FFC62828" } };
      row.getCell("due").font = { name: FONT, size: 11, color: { argb: "FFC62828" } };
    }
  }
  finish(ps, pointCols.length);

  // ---------------- History
  if (opts.history) {
    const histCols: Col[] = [
      { header: "When", key: "when", width: 17, fmt: "d mmm yyyy hh:mm" },
      { header: "Case ID", key: "case", width: 11 },
      { header: "Point #", key: "n", width: 8, align: "center" },
      { header: "Point", key: "point", width: 40, wrap: true },
      { header: "Who", key: "who", width: 18 },
      { header: "Type", key: "type", width: 16 },
      { header: "Detail", key: "detail", width: 60, wrap: true },
      { header: "From email", key: "from", width: 12 },
    ];
    const hs = sheet(wb, "Change log", histCols);
    const TYPE: Record<EventRow["kind"], string> = {
      created: "Point added",
      status: "Status change",
      update: "Update",
      remark: "Remark",
      due: "Deadline change",
      reopen: "Reopened",
      reply: "From a reply",
    };
    for (const e of events) {
      const p = pointById.get(e.point_id);
      let detail = e.text ?? "";
      if (e.kind === "status" && e.status) detail = e.status === "wait" ? `Waiting${e.text ? `: ${e.text}` : ""}` : `Moved to ${STATUS_LABEL[e.status]}`;
      if (e.kind === "due") detail = e.due ? `Deadline set to ${e.due.split("-").reverse().join("/")}` : "Deadline removed";
      if (e.kind === "reopen") detail = "Reopened by the Lead";
      if (e.kind === "created") detail = e.email_pos === null ? "Added by hand" : `From the ${emailName(e.email_pos).toLowerCase()} email`;
      const row = hs.addRow({
        when: local(e.created_at),
        case: caseRef(e.case_id),
        n: numberOf.get(e.point_id),
        point: p?.text ?? "",
        who: e.name ?? "",
        type: TYPE[e.kind],
        detail,
        from: e.email_pos && e.email_pos > 0 ? `Reply ${e.email_pos}` : "",
      });
      link(row.getCell("case"), caseRef(e.case_id), caseUrl(e.case_id));
      if (e.kind === "remark") row.getCell("type").font = { name: FONT, size: 11, bold: true };
    }
    finish(hs, histCols.length);
  }

  // ---------------- Emails
  if (opts.emails) {
    const mailCols: Col[] = [
      { header: "Case ID", key: "case", width: 11 },
      { header: "Email", key: "email", width: 11 },
      { header: "From", key: "from", width: 30, wrap: true },
      { header: "Sent", key: "sent", width: 26, wrap: true },
      { header: "Added by", key: "by", width: 18 },
      { header: "Added on", key: "added", width: 17, fmt: "d mmm yyyy hh:mm" },
      { header: "What it changed", key: "changed", width: 34, wrap: true },
      { header: "Text", key: "body", width: 100, wrap: true },
    ];
    const es = sheet(wb, "Emails", mailCols);
    for (const e of emails) {
      const row = es.addRow({
        case: caseRef(e.case_id),
        email: emailName(e.position),
        from: e.from_email ? `${e.from_name} <${e.from_email}>`.trim() : e.from_name,
        sent: e.email_sent,
        by: e.added_by ?? "",
        added: local(e.created_at),
        changed: e.position > 0 ? (e.change_note ?? "") : "",
        body: clipCell(e.body),
      });
      link(row.getCell("case"), caseRef(e.case_id), caseUrl(e.case_id));
    }
    finish(es, mailCols.length);
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const [y, m, d] = today.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return { buffer, filename: `Agthia-cases-${d}-${mon}-${y}.xlsx`, count: cases.length };
}
