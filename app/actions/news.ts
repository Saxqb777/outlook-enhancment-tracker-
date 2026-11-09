"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";

/** Remembers that this person closed the "What's new" note, on every device. */
export async function markNewsSeen(version: number): Promise<void> {
  const me = await requireUser();
  const v = Math.max(0, Math.min(1000, Math.floor(Number(version) || 0)));
  await q("update users set seen_news = greatest(seen_news, $1) where id = $2", [v, me.id]);
  revalidatePath("/", "layout");
}
