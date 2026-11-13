import { q } from "@/lib/db";
import { getVendorUser } from "@/lib/vendor-auth";
import { rfqThread } from "@/lib/vendors";

export const dynamic = "force-dynamic";

/** The vendor's side of their chat on one request. Reading it marks it read. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await getVendorUser();
  if (!v) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const seen = await q("update rfq_vendors set vendor_read_at = now() where rfq_id = $1 and vendor_id = $2 returning rfq_id", [id, v.vendor_id]);
  if (!seen.length) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ messages: await rfqThread(id, v.vendor_id, true) }, { headers: { "Cache-Control": "private, no-store" } });
}
