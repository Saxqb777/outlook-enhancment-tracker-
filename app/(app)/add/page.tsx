import type { Metadata } from "next";
import AddEmail from "@/components/AddEmail";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { todayISO } from "@/lib/time";
import { assignees } from "@/lib/work";

export const metadata: Metadata = { title: "Add an email" };
export const dynamic = "force-dynamic";
// Reading a long email can take a while; give the AI call room to finish.
export const maxDuration = 120;

export default async function AddPage() {
  const { me, viewOnly } = await getViewer();
  if (viewOnly) {
    return (
      <div className="page-in">
        <header className="ph">
          <div>
            <h1 className="h1">Admin is view only</h1>
            <p className="lede">Emails are added by the Lead and Members. You can see every case they add.</p>
          </div>
        </header>
        <Link className="btn" href="/cases" style={{ alignSelf: "flex-start" }}>
          See cases
        </Link>
      </div>
    );
  }
  const people = me.role === "lead" ? await assignees() : [];
  return <AddEmail role={me.role} meId={me.id} people={people} today={todayISO()} />;
}
