import { getCurrentUser, getViewer } from "@/lib/auth";
import { rtRef } from "@/lib/rate-calc";
import { comparisonWorkbook, xlsxResponse } from "@/lib/rate-excel";
import { getRequest, ratesAccess, rateSettings } from "@/lib/rates";

export const dynamic = "force-dynamic";

/** One enquiry as a comparison sheet: suppliers across, charges down, lowest marked, totals and the award. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Sign in first.", { status: 401 });
  const { me } = await getViewer();
  const { id } = await params;
  const r = ratesAccess(me).view ? await getRequest(id) : null;
  if (!r) return new Response("Not found.", { status: 404 });
  return xlsxResponse(comparisonWorkbook(r, (await rateSettings()).fx), `Rate comparison ${rtRef(r.id)}.xlsx`);
}
