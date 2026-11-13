import type { Metadata } from "next";
import Link from "next/link";
import AddReply from "@/components/AddReply";
import { getViewer } from "@/lib/auth";
import { caseRef } from "@/lib/status";
import { todayISO } from "@/lib/time";
import { getCase } from "@/lib/work";

export const dynamic = "force-dynamic";
// Reading a long thread can take a while.
export const maxDuration = 120;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: /^\d{1,12}$/.test(id) ? `Reply · ${caseRef(id)}` : "Add a reply" };
}

export default async function ReplyPage({ params }: Props) {
  const { me, viewOnly } = await getViewer();
  const { id } = await params;
  const c = await getCase(me, id);
  if (!c || viewOnly) {
    return (
      <div className="page-in">
        <header className="ph">
          <div>
            <h1 className="h1">{viewOnly ? "Admin is view only" : "This case isn't available"}</h1>
            <p className="lede">{viewOnly ? "Replies are added by the person working on the case." : "It may belong to someone else."}</p>
          </div>
        </header>
        <Link className="btn" href={c ? `/cases/${c.id}` : "/cases"} style={{ alignSelf: "flex-start" }}>
          Back
        </Link>
      </div>
    );
  }
  return (
    <AddReply
      caseId={c.id}
      subject={c.subject}
      points={c.points.map((p) => ({ id: p.id, text: p.text, status: p.status, due: p.due }))}
      today={todayISO()}
      caseDeadline={c.deadline ?? ""}
    />
  );
}
