import { getCurrentUser } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { rfqThread } from "@/lib/vendors";

export const dynamic = "force-dynamic";

/** The team's side of one request-and-vendor chat. Reading it marks it read. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const vendor = new URL(req.url).searchParams.get("vendor") ?? "";
  if (!/^\d{1,12}$/.test(id) || !/^\d{1,12}$/.test(vendor) || !(await one("select 1 from rfq_vendors rv join rfqs r on r.id = rv.rfq_id where rv.rfq_id = $1 and rv.vendor_id = $2 and ($3 or not r.test)", [id, vendor, user.role === "admin"]))) return Response.json({ error: "Not found." }, { status: 404 });
  const messages = await rfqThread(id, vendor, false);
  if (user.role !== "admin")
    await q("insert into rfq_reads (rfq_id, vendor_id, user_id) values ($1, $2, $3) on conflict (rfq_id, vendor_id, user_id) do update set last_read_at = now()", [id, vendor, user.id]);
  return Response.json({ messages }, { headers: { "Cache-Control": "private, no-store" } });
}
