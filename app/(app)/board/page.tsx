import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Board" };
export const dynamic = "force-dynamic";

export default async function BoardPage() {
  await requireUser();
  return (
    <ComingSoon
      title="Board"
      lede="Every open point by its status: To do, In progress, Waiting, Done and Approved."
      icon="board"
      heading="Nothing on the board yet"
      body="Points appear here once emails are added. You'll be able to drag them between columns as the work moves."
    />
  );
}
