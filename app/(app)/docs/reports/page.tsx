import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import PrintButton from "@/components/PrintButton";
import { DocsTabs } from "@/components/XDocs";
import { getViewer } from "@/lib/auth";
import { fmtDay, todayISO } from "@/lib/time";
import { docsAccess, listTxns } from "@/lib/xdocs";
import { period, summarize } from "@/lib/xdocs-view";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";
const aed = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  const { me, real } = await getViewer();
  if (!docsAccess(me).view) notFound();
  const sp = await searchParams;
  const today = todayISO();
  const kind = String(sp.p ?? "this");
  const per = period(kind, today, sp.from, sp.to);
  const txns = await listTxns(per.from, per.to);
  const s = summarize(txns);
  const qs = `from=${per.from}&to=${per.to}`;
  const months = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1)).toISOString().slice(0, 7));
  const pick = (k: string, label: string) => (
    <Link key={k} href={`/docs/reports?p=${k}`} className="chip all" aria-pressed={kind === k || (kind === "this" && k === months[0])}>
      {label}
    </Link>
  );
  return (
    <div className="page-in xd-report">
      <header className="ph">
        <div>
          <h1 className="h1">Card utilization report</h1>
          <p className="lede">
            {per.label} · {fmtDay(per.from)} to {fmtDay(per.to)}
          </p>
        </div>
        <div className="ap-tools no-print">
          <a className="btn" href={`/docs/export?kind=month&${qs}`} download>
            <Icon name="download" size={15} />
            Excel: monthly report
          </a>
          <a className="btn" href={`/docs/export?kind=finance&${qs}`} download>
            <Icon name="download" size={15} />
            Excel: charge to customers
          </a>
          <PrintButton label="Print to sign" />
        </div>
      </header>
      <div className="no-print">
        <DocsTabs />
        <div className="chips xd-periods" role="group" aria-label="Period">
          {months.map((m, i) => pick(m, i === 0 ? "This month" : new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`))))}
          {pick("cycle", "Statement period (19th to 18th)")}
        </div>
        <form className="rt-filter-row xd-filter" action="/docs/reports">
          <input type="hidden" name="p" value="custom" />
          <label className="rt-since">
            <span>From</span>
            <input type="date" name="from" className="inp inp-date" defaultValue={per.from} />
          </label>
          <label className="rt-since">
            <span>To</span>
            <input type="date" name="to" className="inp inp-date" defaultValue={per.to} />
          </label>
          <button className="btn btn-sm" type="submit">
            Show these dates
          </button>
        </form>
      </div>
      <section className="stats" aria-label="Totals">
        <div className="stat attn"><span className="lab">Spent on the cards</span><span className="val">AED {aed(s.spent)}</span><span className="ctx">{txns.filter((t) => t.kind === "spend").length} payments</span></div>
        <div className="stat"><span className="lab">Top-ups received</span><span className="val">AED {aed(s.topups)}</span><span className="ctx">paid onto the cards by Finance</span></div>
        <div className="stat"><span className="lab">To charge to customers</span><span className="val">AED {aed(s.charge)}</span><span className="ctx">{s.byCustomer.length} customer{s.byCustomer.length === 1 ? "" : "s"}</span></div>
      </section>
      <section className="panel" aria-label="Where the money went">
        <div className="panel-h"><h2>Where the money went</h2></div>
        {s.matrix.length ? (
          <div className="rt-table-wrap">
            <table className="rt-table">
              <thead><tr><th>Used for</th>{s.cards.map((c) => <th key={c} className="r">{c}</th>)}<th className="r">Total (AED)</th><th className="r">Share</th></tr></thead>
              <tbody>
                {s.matrix.map((r) => (
                  <tr key={r.cat}><td><b>{r.cat}</b></td>{r.cells.map((v, i) => <td key={i} className="r">{v ? aed(v) : "–"}</td>)}<td className="r"><b>{aed(r.total)}</b></td><td className="r">{s.spent ? `${Math.round((r.total / s.spent) * 100)}%` : ""}</td></tr>
                ))}
                <tr className="sum"><td>Total spent</td>{s.byCard.map(([c, v]) => <td key={c} className="r"><b>{aed(v)}</b></td>)}<td className="r"><b>{aed(s.spent)}</b></td><td /></tr>
                {s.topups > 0 && <tr><td>Top-ups received</td>{s.byCard.map(([c, , t]) => <td key={c} className="r">{t ? aed(t) : "–"}</td>)}<td className="r">{aed(s.topups)}</td><td /></tr>}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">Nothing was entered for these dates.</p>}
      </section>
      <section className="panel" aria-label="Charge to customers">
        <div className="panel-h"><h2>For Finance: charge to customers</h2><span className="small muted">Costs marked &ldquo;charge to customer&rdquo; in this period</span></div>
        {s.byCustomer.length ? (
          <div className="rt-table-wrap">
            <table className="rt-table">
              <thead><tr><th>Customer</th><th>Date</th><th>What</th><th>Card</th><th className="r">Amount (AED)</th></tr></thead>
              <tbody>
                {s.byCustomer.flatMap(([cust, total, rows]) => [
                  ...rows.map((t, i) => <tr key={t.id}><td>{i === 0 ? <b>{cust}</b> : ""}</td><td>{fmtDay(t.on_date)}</td><td>{[t.doc, t.category && !t.doc ? t.category : "", t.description].filter(Boolean).join(" · ")}</td><td>{t.card}</td><td className="r">{aed(t.amount)}</td></tr>),
                  <tr key={`${cust}-sum`} className="sum"><td colSpan={4}>Total to charge {cust}</td><td className="r"><b>{aed(total)}</b></td></tr>,
                ])}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">Nothing is marked to charge to a customer for these dates.</p>}
      </section>
      <section className="panel" aria-label="All transactions">
        <div className="panel-h"><h2>Every transaction <span className="count">{txns.length}</span></h2></div>
        {txns.length ? (
          <div className="rt-table-wrap">
            <table className="rt-table">
              <thead><tr><th>Date</th><th>Used for</th><th>Details</th><th>Card</th><th>Charge to</th><th className="r">Amount (AED)</th></tr></thead>
              <tbody>
                {[...txns].reverse().map((t) => (
                  <tr key={t.id}><td>{fmtDay(t.on_date)}</td><td>{t.kind === "topup" ? "Top-up" : (t.category ?? "–")}</td><td>{[t.doc, t.description, !t.charge_customer && t.shipment_id ? t.customer : ""].filter(Boolean).join(" · ")}</td><td>{t.card}</td><td>{t.kind === "spend" && t.charge_customer ? t.customer || "Customer" : ""}</td><td className="r">{t.kind === "topup" ? `+ ${aed(t.amount)}` : aed(t.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">No transactions.</p>}
      </section>
      <div className="xd-sign">
        <div><span>Prepared by</span><b>{real.role === "admin" ? "" : real.name}</b></div>
        <div><span>Checked by</span><b /></div>
        <div><span>Received by Finance</span><b /></div>
      </div>
    </div>
  );
}
