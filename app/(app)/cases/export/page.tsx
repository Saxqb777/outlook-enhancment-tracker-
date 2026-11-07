import type { Metadata } from "next";
import ExportView from "@/components/ExportView";
import { getViewer } from "@/lib/auth";
import { todayISO } from "@/lib/time";
import { listCases } from "@/lib/work";

export const metadata: Metadata = { title: "Export to Excel" };
export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const { me } = await getViewer();
  const rows = await listCases(me);
  const cases = rows.map((c) => ({ ...c, created_at: new Date(c.created_at).toISOString() }));
  return <ExportView cases={cases} role={me.role === "member" ? "member" : "lead"} today={todayISO()} />;
}
