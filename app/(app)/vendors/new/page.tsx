import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { RfqNew } from "@/components/Vendors";
import { getViewer } from "@/lib/auth";
import { caseRef } from "@/lib/status";
import { todayISO } from "@/lib/time";
import { listTemplates, listVendors } from "@/lib/vendors";
import { getCase } from "@/lib/work";

export const metadata: Metadata = { title: "New vendor request" };
export const dynamic = "force-dynamic";

export default async function NewRfqPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const { me, real, viewOnly: vo, viewingAs } = await getViewer();
  const sandbox = real.role === "admin" && !viewingAs;
  const viewOnly = vo && !sandbox;
  const sp = await searchParams;
  const [vendors, templates, c] = viewOnly ? [[], [], null] : await Promise.all([listVendors(sandbox), listTemplates(), sp.case && /^\d+$/.test(sp.case) ? getCase(me, sp.case) : Promise.resolve(null)]);
  return (
    <div className="page-in ap-narrow">
      <Link className="back" href="/vendors">
        <Icon name="back" size={15} />
        Vendors
      </Link>
      <header className="ph">
        <div>
          <h1 className="h1">{viewOnly ? "Admin is view only" : sandbox ? "Sandbox: ask vendors for a price" : "Ask vendors for a price"}</h1>
          <p className="lede">{viewOnly ? "Requests are made by the Leads and Members. You can see every one of them." : sandbox ? "This is the test area. The request only goes to sandbox vendors and only you can see it. Set up the sandbox on the Admin page if the list below is empty." : "Build the form the way you need it, pick the vendors, and send. They reply with a price or say they can't do it."}</p>
        </div>
      </header>
      {!viewOnly && (
        <RfqNew
          sandbox={sandbox}
          vendors={vendors.filter((v) => v.status === "active" && v.test === sandbox).map((v) => ({ id: v.id, name: v.name, services: v.services, people: v.people, status: v.status }))}
          templates={templates}
          today={todayISO()}
          start={c ? { title: c.subject, caseId: c.id, caseRef: caseRef(c.id) } : undefined}
        />
      )}
    </div>
  );
}
