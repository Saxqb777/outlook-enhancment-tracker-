import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Cases" };
export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const me = await requireUser();
  return (
    <ComingSoon
      title="Cases"
      lede={me.role === "lead" ? "Every email your team is working on." : "Every email you're working on."}
      icon="mail"
      heading="No cases yet"
      body="Adding emails arrives in the next update. Each email you add becomes a case here, with its points listed under it."
    />
  );
}
