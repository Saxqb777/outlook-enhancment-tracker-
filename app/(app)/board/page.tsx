import type { Metadata } from "next";
import Link from "next/link";
import BoardView from "@/components/BoardView";
import { Icon } from "@/components/Icon";
import { cap } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { todayISO } from "@/lib/time";
import { leadName, listPoints } from "@/lib/work";

export const metadata: Metadata = { title: "Board" };
export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const { me, viewOnly } = await getViewer();
  const [rows, lead] = await Promise.all([listPoints(me), leadName()]);
  const points = rows.map((p) => ({ ...p, last_at: p.last_at ? new Date(p.last_at).toISOString() : null }));

  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <h1 className="h1">Board</h1>
          <p className="lede opt">
            {viewOnly
              ? "Every point by status. View only."
              : me.role !== "member"
              ? "Every point by status. Drag a card to move it, or drop it on Approved to sign it off."
              : `Your points by status. Drag a card to move it. ${cap(lead)} approves points you mark done.`}
          </p>
        </div>
        <div className="ph-act">
          <div className="seg" role="group" aria-label="View">
            <Link href="/cases">
              <Icon name="cases" size={15} />
              List
            </Link>
            <Link href="/board" aria-current="page">
              <Icon name="board" size={15} />
              Board
            </Link>
          </div>
        </div>
      </header>
      {points.length ? (
        <BoardView points={points} role={me.role === "member" ? "member" : "lead"} leadName={lead} today={todayISO()} />
      ) : (
        <section className="panel empty-state">
          <span className="es-i">
            <Icon name="board" size={26} />
          </span>
          <h2>Nothing on the board yet</h2>
          <p>Each point from an email shows up here as a card, sorted by status.</p>
          {!viewOnly && (
            <Link className="btn btn-primary" href="/add" style={{ marginTop: 12 }}>
              <Icon name="plus" size={15} />
              Add an email
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
