import type { Metadata } from "next";
import Link from "next/link";
import { ApprovalList, type ApItem } from "@/components/Approvals";
import { Icon } from "@/components/Icon";
import { apRef, listApprovals } from "@/lib/approvals";
import { getViewer } from "@/lib/auth";
import { diffDays, fmtDay, fmtShort, todayISO } from "@/lib/time";

export const metadata: Metadata = { title: "Approvals" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const { me, viewOnly } = await getViewer();
  const today = todayISO();
  const rows = await listApprovals(me);
  const items: ApItem[] = rows.map((a) => ({
    id: a.id,
    ref: apRef(a.id),
    title: a.title,
    status: a.status,
    version: a.version,
    needed: a.needed_by ? fmtDay(a.needed_by) : null,
    late: !!a.needed_by && diffDays(a.needed_by, today) < 0,
    when: fmtShort(todayISO(new Date(a.closed_at ?? a.created_at))),
    requester_id: a.requester_id,
    requester: a.requester,
    signers: a.signers,
    files: a.files,
    mine: a.mine,
  }));
  const seeAll = me.role !== "member";
  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <h1 className="h1">Approvals</h1>
          <p className="lede opt">{seeAll ? "Every sign-off the team has asked for. Ask anyone to sign a document or a request." : "Ask anyone to sign a document or a request, and sign the ones sent to you."}</p>
        </div>
        {!viewOnly && (
          <div className="ph-act">
            <Link className="btn btn-primary" href="/approvals/new" data-tour="ap-new" data-key="n">
              <Icon name="plus" size={15} />
              New request
              <kbd className="kbd">N</kbd>
            </Link>
          </div>
        )}
      </header>
      <ApprovalList items={items} meId={me.id} seeAll={seeAll} />
    </div>
  );
}
