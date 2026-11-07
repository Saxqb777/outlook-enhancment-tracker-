import type { Metadata } from "next";
import AddEmail from "@/components/AddEmail";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/time";
import { assignees } from "@/lib/work";

export const metadata: Metadata = { title: "Add an email" };
export const dynamic = "force-dynamic";
// Reading a long email can take a while; give the AI call room to finish.
export const maxDuration = 120;

export default async function AddPage() {
  const me = await requireUser();
  const people = me.role === "lead" ? await assignees() : [];
  return <AddEmail role={me.role} meId={me.id} people={people} today={todayISO()} />;
}
