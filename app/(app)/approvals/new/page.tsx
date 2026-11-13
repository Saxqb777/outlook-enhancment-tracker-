import type { Metadata } from "next";
import Link from "next/link";
import { ApprovalNew } from "@/components/Approvals";
import { Icon } from "@/components/Icon";
import { getViewer } from "@/lib/auth";
import { todayISO } from "@/lib/time";
import { assignees } from "@/lib/work";

export const metadata: Metadata = { title: "New approval request" };
export const dynamic = "force-dynamic";

export default async function NewApprovalPage() {
  const { me, viewOnly } = await getViewer();
  const people = viewOnly ? [] : (await assignees()).filter((p) => p.id !== me.id);
  return (
    <div className="page-in ap-narrow">
      <Link className="back" href="/approvals">
        <Icon name="back" size={15} />
        Approvals
      </Link>
      <header className="ph">
        <div>
          <h1 className="h1">{viewOnly ? "Admin is view only" : "Ask for an approval"}</h1>
          <p className="lede">{viewOnly ? "Requests are made by the Leads and Members. You can see every one of them." : "Write it or attach the document, then pick who signs. They get a pop-up straight away."}</p>
        </div>
      </header>
      {!viewOnly && <ApprovalNew people={people} today={todayISO()} />}
    </div>
  );
}
