import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RatesHome } from "@/components/Rates";
import { getViewer } from "@/lib/auth";
import { isImage, sizeLabel } from "@/lib/attach-rules";
import { listDocs, listFeedback, listQuotes, listRequests, listSuppliers, ratesAccess, rateSettings } from "@/lib/rates";
import { fmtStamp, todayISO } from "@/lib/time";

export const metadata: Metadata = { title: "Rates" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function RatesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; supplier?: string }> }) {
  const { me, viewOnly } = await getViewer();
  const access = ratesAccess(me);
  if (!access.view) notFound();
  const sp = await searchParams;
  const [reqs, quotes, sups, settings, docs, notes] = await Promise.all([listRequests(), listQuotes(), listSuppliers(), rateSettings(), listDocs(), listFeedback()]);
  const manage = access.manage && !viewOnly;
  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <h1 className="h1">Rates</h1>
          <p className="lede opt">{manage ? "Every freight quote you've received, in one place. Type a route to see past rates, the best one, and how suppliers compare." : "The freight rate book: every quotation on record. You can search, compare and export."}</p>
        </div>
      </header>
      <RatesHome
        reqs={reqs.map(({ created_at: _c, by: _b, ...r }) => (void _c, void _b, r))}
        quotes={quotes.map(({ replaces_id: _r, replaced_at: _a, created_at: _c, ...x }) => (void _r, void _a, void _c, x))}
        sups={sups}
        fx={settings.fx}
        charges={settings.charges}
        manage={manage}
        today={todayISO()}
        docs={docs.map((d) => ({ id: d.id, title: d.title, route: d.route, supplier: d.supplier, doc_date: d.doc_date, notes: d.notes, name: d.name, size: sizeLabel(d.size), view: d.mime === "application/pdf" || isImage(d.mime), by: d.by, added: fmtStamp(d.created_at) }))}
        notes={notes.map((n) => ({ id: n.id, body: n.body, status: n.status, reply: n.reply, by: n.by, at: fmtStamp(n.created_at) }))}
        canNote={!viewOnly && me.role !== "admin"}
        initial={{ from: String(sp.from ?? "").slice(0, 80), to: String(sp.to ?? "").slice(0, 80), supplier: String(sp.supplier ?? "").slice(0, 120) }}
      />
    </div>
  );
}
