import type { Metadata } from "next";
import Link from "next/link";
import CaseView from "@/components/CaseView";
import { requireUser } from "@/lib/auth";
import { caseRef } from "@/lib/status";
import { todayISO } from "@/lib/time";
import { getCase, leadName } from "@/lib/work";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: /^\d{1,12}$/.test(id) ? caseRef(id) : "Case" };
}

export default async function CasePage({ params }: Props) {
  const me = await requireUser();
  const { id } = await params;
  const [c, lead] = await Promise.all([getCase(me, id), leadName()]);

  if (!c) {
    return (
      <div className="page-in">
        <header className="ph">
          <div>
            <h1 className="h1">This case isn&apos;t available</h1>
            <p className="lede">
              {me.role === "lead" ? "The link may be wrong, or the case was removed." : "It may belong to someone else. Members only see their own cases."}
            </p>
          </div>
        </header>
        <Link className="btn" href="/cases" style={{ alignSelf: "flex-start" }}>
          Go to cases
        </Link>
      </div>
    );
  }

  const data = {
    ...c,
    created_at: new Date(c.created_at).toISOString(),
    points: c.points.map((p) => ({
      ...p,
      events: p.events.map((e) => ({ ...e, created_at: new Date(e.created_at).toISOString() })),
    })),
  };
  return <CaseView c={data} role={me.role} leadName={lead} today={todayISO()} />;
}
