import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { DocsTabs, ShipmentView } from "@/components/XDocs";
import { getViewer } from "@/lib/auth";
import { fmtDay, todayISO } from "@/lib/time";
import { docsAccess, getShipment, listCards, listCategories, listTypes, xdRef } from "@/lib/xdocs";
import { cardV, docV, shipV, txnV } from "@/lib/xdocs-view";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: /^\d+$/.test(id) ? xdRef(id) : "Export Docs" };
}

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me, viewOnly } = await getViewer();
  const access = docsAccess(me);
  if (!access.view) notFound();
  const s = await getShipment(id);
  if (!s) notFound();
  const [types, cards, cats] = await Promise.all([listTypes(), listCards(), listCategories()]);
  const today = todayISO();
  return (
    <div className="page-in ap-page">
      <Link className="back no-print" href="/docs">
        <Icon name="back" size={15} />
        Export Docs
      </Link>
      <header className="ph">
        <div>
          <p className="ap-ref">
            <span className="cid">{xdRef(s.id)}</span>
          </p>
          <h1 className="h1">{s.customer}</h1>
          <p className="rt-facts">
            {s.country && <span>{s.country}</span>}
            {s.invoice_no && <span>Invoice {s.invoice_no}</span>}
            {s.incoterm && <span>{s.incoterm}</span>}
            {s.shipped_on && <span>Shipped {fmtDay(s.shipped_on)}</span>}
            {s.by && <span>Added by {s.by}</span>}
          </p>
          {s.notes && <p className="small muted">{s.notes}</p>}
        </div>
      </header>
      <DocsTabs />
      <ShipmentView ship={shipV(s)} docs={s.docList.map(docV)} other={s.other.map(txnV)} types={types} cards={cards.map((c) => cardV(c, today))} cats={cats} manage={access.manage && !viewOnly} today={today} />
    </div>
  );
}
