import { getCurrentUser, getViewer } from "@/lib/auth";
import { ratesWorkbook, xlsxResponse } from "@/lib/rate-excel";
import { listQuotes, listRequests, ratesAccess, rateSettings } from "@/lib/rates";
import { todayISO } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Excel of the quotations currently shown in the search (the browser sends which ones). */
export async function POST(req: Request) {
  if (!(await getCurrentUser())) return new Response("Sign in first.", { status: 401 });
  const { me } = await getViewer();
  if (!ratesAccess(me).view) return new Response("Not found.", { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { keys?: unknown; title?: unknown };
  const keys = Array.isArray(body.keys) ? new Set(body.keys.map(String).slice(0, 20000)) : null;
  const [reqs, quotes, settings] = await Promise.all([listRequests(), listQuotes(), rateSettings()]);
  const today = todayISO();
  return xlsxResponse(ratesWorkbook(reqs, quotes, settings.fx, keys, String(body.title ?? "").slice(0, 120), today), `Freight rates ${today}.xlsx`);
}
