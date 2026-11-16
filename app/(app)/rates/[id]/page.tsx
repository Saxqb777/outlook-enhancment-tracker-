import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { EnquiryView } from "@/components/Rates";
import { isImage, sizeLabel } from "@/lib/attach-rules";
import { getViewer } from "@/lib/auth";
import { q } from "@/lib/db";
import { MODES, rtRef, SERVICES } from "@/lib/rate-calc";
import { getRequest, listQuotes, listRequests, listSuppliers, ratesAccess, rateSettings } from "@/lib/rates";
import { fmtDay, fmtStamp, todayISO } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: /^\d+$/.test(id) ? rtRef(id) : "Rates" };
}

export default async function RateEnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me, viewOnly } = await getViewer();
  const access = ratesAccess(me);
  if (!access.view) notFound();
  const r = await getRequest(id);
  if (!r) notFound();
  const [reqs, quotes, sups, settings, leads] = await Promise.all([listRequests(), listQuotes(), listSuppliers(), rateSettings(), q<{ id: string; name: string }>("select id, name from users where role = 'lead' and status = 'active' order by lower(name)")]);
  const strip = <T extends { replaces_id: string | null; replaced_at: Date | null; created_at: Date }>({ replaces_id: _r, replaced_at: _a, created_at: _c, ...x }: T) => (void _r, void _a, void _c, x);
  const place = (a: string, b: string, c: string) => [a, c && c !== a ? c : "", b].filter(Boolean).join(", ");
  return (
    <div className="page-in ap-page">
      <Link className="back no-print" href="/rates">
        <Icon name="back" size={15} />
        Rates
      </Link>
      <header className="ph">
        <div>
          <p className="ap-ref">
            <span className="cid">{rtRef(r.id)}</span>
            <span className={`ap-st ${r.status === "awarded" ? "signed" : "rq-open"}`}>{r.status === "awarded" ? "Awarded" : "Open"}</span>
          </p>
          <h1 className="h1">{r.title}</h1>
          <p className="lede">
            {place(r.origin, r.origin_country, r.origin_port)} → {place(r.destination, r.destination_country, r.destination_port)}
          </p>
          <p className="rt-facts">
            {r.commodity && <span>{r.commodity}</span>}
            <span>{MODES[r.mode]}</span>
            <span>{SERVICES[r.service]}</span>
            {r.incoterm && <span>{r.incoterm}</span>}
            {r.equipment.map((e) => (
              <span key={e.type}>
                {e.qty} × {e.type}
              </span>
            ))}
            <span>Asked {fmtDay(r.requested_on)}</span>
          </p>
          {r.notes && <p className="small muted">{r.notes}</p>}
        </div>
      </header>
      <EnquiryView
        req={(({ created_at: _c, by: _b, quotes: _q, old: _o, files: _f, approval_status: _s, ...x }) => (void _c, void _b, void _q, void _o, void _f, void _s, x))(r)}
        quotes={r.quotes.map(strip)}
        old={r.old.map((x) => ({ ...strip(x), replaced: x.replaced_at ? fmtStamp(x.replaced_at) : "" }))}
        files={r.files.map((f) => ({ id: f.id, quote_id: f.quote_id, name: f.name, size: sizeLabel(f.size), view: f.mime === "application/pdf" || isImage(f.mime) }))}
        fx={settings.fx}
        charges={settings.charges}
        sups={sups}
        allQuotes={quotes.map(strip)}
        allReqs={reqs.map(({ created_at: _c, by: _b, ...x }) => (void _c, void _b, x))}
        manage={access.manage && !viewOnly}
        today={todayISO()}
        leads={leads.filter((p) => p.id !== me.id)}
        approvalStatus={r.approval_status}
      />
    </div>
  );
}
