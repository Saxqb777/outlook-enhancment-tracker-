import type { Metadata } from "next";
import Link from "next/link";
import { diffDays, fmtDay, fmtShort, todayISO } from "@/lib/time";
import { requireVendor } from "@/lib/vendor-auth";
import { money, rqRef } from "@/lib/vendor-labels";
import { portalList, type PortalRow } from "@/lib/vendors";

export const metadata: Metadata = { title: "Vendor portal" };
export const dynamic = "force-dynamic";

const val = (fields: { label: string; value: string }[], label: string) => fields.find((f) => f.label.toLowerCase() === label)?.value ?? "";
const LABEL: Record<string, [string, string]> = { won: ["You won · confirm", "todo"], confirmed: ["Confirmed", "signed"], done: ["Done", "signed"], lost: ["Not chosen", "cancelled"], cancelled: ["Cancelled", "cancelled"] };

function Row({ r, today }: { r: PortalRow; today: string }) {
  const [label, cls] = r.result !== "open" ? LABEL[r.result] : r.state === "quoted" ? ["Quoted", "signed"] : r.state === "declined" ? ["Can't do", "cancelled"] : ["Reply needed", "todo"];
  const late = r.result === "open" && r.state === "invited" && !!r.reply_by && diffDays(r.reply_by, today) < 0;
  const soon = r.result === "open" && r.state === "invited" && !!r.reply_by && !late && diffDays(r.reply_by, today) <= 1;
  return (
    <Link className="aprow rqrow" href={`/portal/r/${r.id}`}>
      <span className="cid">{rqRef(r.id)}</span>
      <span className="ap-main">
        <span className="ap-title">
          {r.unread > 0 && <span className="unread-dot" title={`${r.unread} new`} />}
          {r.title}
        </span>
        <span className="ap-sub">
          <span>{fmtShort(todayISO(new Date(r.created_at)))}</span>
          {(val(r.fields, "from") || val(r.fields, "to")) && <span>{[val(r.fields, "from"), val(r.fields, "to")].filter(Boolean).join(" → ")}</span>}
        </span>
      </span>
      <span className="ap-prog small">{r.unread > 0 ? `${r.unread} new` : ""}</span>
      <span className="rq-best">{r.state === "quoted" ? money(r.price, r.currency) : ""}</span>
      <span className="ap-end">
        {r.result === "open" && r.state === "invited" && r.reply_by && <span className={`due${late ? " late" : soon ? " soon" : ""}`}>{late ? "Was due" : "Reply by"} {fmtDay(r.reply_by)}</span>}
        <span className={`ap-st ${cls}`}>{label}</span>
      </span>
    </Link>
  );
}

export default async function PortalHome() {
  const v = await requireVendor();
  const today = todayISO();
  const rows = await portalList(v.vendor_id);
  const need = rows.filter((r) => (r.result === "open" && r.state === "invited") || r.result === "won");
  const open = rows.filter((r) => r.result === "open" && r.state !== "invited");
  const jobs = rows.filter((r) => r.result === "confirmed");
  const past = rows.filter((r) => ["done", "lost", "cancelled"].includes(r.result));
  const groups: [string, PortalRow[], string][] = [
    ["Needs your reply", need, "Nothing is waiting for you. New requests from Agthia will show up here."],
    ["Quoted, waiting for Agthia", open, ""],
    ["Your confirmed jobs", jobs, ""],
    ["Past requests", past, ""],
  ];
  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <h1 className="h1">Hello, {v.name.split(/\s+/)[0]}</h1>
          <p className="lede">Requests from Agthia for {v.vendor}. Open one to send your price, say you can&apos;t do it, or chat about it.</p>
        </div>
      </header>
      {groups.map(([title, list, empty]) =>
        list.length || empty ? (
          <section className="panel" key={title} aria-label={title}>
            <div className="panel-h">
              <h2>
                {title} <span className="count">{list.length}</span>
              </h2>
            </div>
            <div className="list">
              {list.map((r) => (
                <Row key={r.id} r={r} today={today} />
              ))}
              {!list.length && <p className="empty">{empty}</p>}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}
