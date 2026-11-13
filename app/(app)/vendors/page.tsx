import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { VendorsHome, type RfqItem, type VendorItem } from "@/components/Vendors";
import { getViewer } from "@/lib/auth";
import { diffDays, fmtDay, fmtShort, todayISO } from "@/lib/time";
import { money, nextStep, rqRef } from "@/lib/vendor-labels";
import { listRfqs, listVendors } from "@/lib/vendors";

export const metadata: Metadata = { title: "Vendors" };
export const dynamic = "force-dynamic";

const val = (fields: { label: string; value: string }[], label: string) => fields.find((f) => f.label.toLowerCase() === label)?.value ?? "";

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { me, real, viewOnly, viewingAs } = await getViewer();
  const sandbox = real.role === "admin" && !viewingAs;
  const { tab } = await searchParams;
  const today = todayISO();
  const [rfqs, vendors] = await Promise.all([listRfqs(me, sandbox), listVendors(sandbox)]);
  const items: RfqItem[] = rfqs.map((r) => ({
    id: r.id,
    ref: rqRef(r.id),
    title: r.title,
    status: r.status,
    by: r.by,
    mine: r.created_by === me.id,
    route: [val(r.fields, "from"), val(r.fields, "to")].filter(Boolean).join(" → "),
    when: fmtShort(todayISO(new Date(r.created_at))),
    replyBy: r.reply_by ? fmtDay(r.reply_by) : null,
    late: !!r.reply_by && diffDays(r.reply_by, today) < 0,
    vendors: r.vendors,
    replied: r.replied,
    best: r.best ? money(r.best, r.best_currency) : null,
    winner: r.winner,
    unread: r.unread,
    next: nextStep(r),
    job: { due: r.job_due ? fmtDay(r.job_due) : null, late: !!r.job_due && r.status !== "done" && diffDays(r.job_due, today) < 0, total: r.ms_total, done: r.ms_done, next: r.ms_next, problems: r.problems },
    test: r.test,
  }));
  const vitems: VendorItem[] = vendors.map((v) => ({ id: v.id, name: v.name, services: v.services, areas: v.areas, status: v.status, people: v.people, test: v.test, asked: v.asked, quoted: v.quoted, won: v.won, replyHours: v.reply_hours }));
  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <h1 className="h1">Vendors</h1>
          <p className="lede opt">Ask your transporters for a price, compare their quotes side by side, and pick one. Each vendor answers in their own portal.</p>
        </div>
        <div className="ph-act">
          <a className="btn" href="/vendors/export" download>
            <Icon name="download" size={15} />
            <span className="m-hide">Export to Excel</span>
            <span className="m-only-i">Export</span>
          </a>
          {(!viewOnly || sandbox) && (
            <Link className="btn btn-primary" href="/vendors/new" data-tour="vn-new">
              <Icon name="plus" size={15} />
              {sandbox ? "New sandbox request" : "New request"}
            </Link>
          )}
        </div>
      </header>
      <VendorsHome rfqs={items} vendors={vitems} initial={tab === "vendors" ? "vendors" : tab === "jobs" ? "jobs" : "requests"} canAdd={!viewOnly || sandbox} />
    </div>
  );
}
