import type { Metadata } from "next";
import Link from "next/link";
import CaseList from "@/components/CaseList";
import { Icon } from "@/components/Icon";
import { getViewer } from "@/lib/auth";
import { todayISO } from "@/lib/time";
import { assignees, listCases } from "@/lib/work";

export const metadata: Metadata = { title: "Cases" };
export const dynamic = "force-dynamic";

const SHOW = ["open", "late", "review", "closed", "all"] as const;

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const { me, viewOnly } = await getViewer();
  const { show, q } = await searchParams;
  const archived = show === "archived";
  const [rows, people] = await Promise.all([listCases(me, archived), me.role === "lead" ? assignees() : Promise.resolve([])]);
  const cases = rows.map((c) => ({ ...c, created_at: new Date(c.created_at).toISOString() }));
  const initial = SHOW.find((s) => s === show) ?? "open";

  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <h1 className="h1">{archived ? "Archived cases" : "Cases"}</h1>
          <p className="lede opt">{me.role !== "member" ? "Every email the team is working on, one case per email." : "Every email you're working on, one case per email."}</p>
        </div>
        <div className="ph-act">
          <div className="seg" role="group" aria-label="View">
            <Link href="/cases" aria-current="page">
              <Icon name="cases" size={15} />
              List
            </Link>
            <Link href="/board">
              <Icon name="board" size={15} />
              Board
            </Link>
          </div>
          <Link className="btn btn-ghost" href={archived ? "/cases" : "/cases?show=archived"}>
            {archived ? "Back to cases" : "Archived"}
          </Link>
          <Link className="btn" href="/cases/export">
            <Icon name="download" size={15} />
            <span className="m-hide">Export to Excel</span>
            <span className="m-only-i">Export</span>
          </Link>
          {!viewOnly && (
            <Link className="btn btn-primary m-hide" href="/add">
              <Icon name="plus" size={15} />
              Add an email
            </Link>
          )}
        </div>
      </header>
      <CaseList cases={cases} role={me.role === "member" ? "member" : "lead"} today={todayISO()} initial={archived ? "all" : initial} initialQ={String(q ?? "").slice(0, 80)} people={people} />
    </div>
  );
}
