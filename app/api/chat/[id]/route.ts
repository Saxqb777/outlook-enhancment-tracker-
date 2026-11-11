import { getCurrentUser } from "@/lib/auth";
import { canSeeCase, caseFeed, markRead } from "@/lib/chat";

export const dynamic = "force-dynamic";

/** The case feed. Polled by the chat while it is open; `?read=1` marks it read for this person. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  if (!(await canSeeCase(user, id))) return Response.json({ error: "Not found." }, { status: 404 });
  const items = await caseFeed(user, id);
  if (new URL(req.url).searchParams.has("read")) await markRead(user.id, id);
  return Response.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}
