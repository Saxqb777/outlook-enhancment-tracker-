import { getCurrentUser, getViewer, siteOrigin } from "@/lib/auth";
import { buildWorkbook } from "@/lib/export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Excel export of the chosen cases. Members only get their own cases; the Lead and Admin can export any. */
export async function POST(req: Request) {
  const signedIn = await getCurrentUser();
  if (!signedIn) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { me, real, viewingAs } = await getViewer();
  let body: { ids?: unknown; history?: unknown; emails?: unknown; filters?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x) => /^\d{1,12}$/.test(x)).slice(0, 2000);
  if (!ids.length) return Response.json({ error: "Pick at least one case." }, { status: 400 });
  const role = (r: string) => (r === "lead" ? "Lead" : r === "admin" ? "Admin" : "Member");
  const exportedBy = viewingAs ? `${real.name} (Admin, viewing as ${viewingAs.name})` : `${real.name} (${role(real.role)})`;
  const { buffer, filename, count } = await buildWorkbook(me, ids, {
    history: body.history !== false,
    emails: body.emails === true,
    filters: String(body.filters ?? "").replace(/\s+/g, " ").slice(0, 300),
    origin: await siteOrigin(),
    exportedBy,
  });
  if (!count) return Response.json({ error: "None of those cases are available to you." }, { status: 404 });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
