import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsHome, DocsTabs } from "@/components/XDocs";
import { getViewer } from "@/lib/auth";
import { docsAccess, listDocs, listShipments } from "@/lib/xdocs";
import { docV, shipV } from "@/lib/xdocs-view";

export const metadata: Metadata = { title: "Export Docs" };
export const dynamic = "force-dynamic";

export default async function ExportDocsPage() {
  const { me, viewOnly } = await getViewer();
  const access = docsAccess(me);
  if (!access.view) notFound();
  const [ships, docs] = await Promise.all([listShipments(), listDocs()]);
  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <h1 className="h1">Export Docs</h1>
          <p className="lede opt">Every export shipment with all its documents in one place. Type a document number to get it straight away.</p>
        </div>
      </header>
      <DocsTabs />
      <DocsHome ships={ships.map(shipV)} docs={docs.map(docV)} manage={access.manage && !viewOnly} />
    </div>
  );
}
