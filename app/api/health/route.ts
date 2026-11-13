import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

/** A simple "is it up" check: whether the database answers, and which database change was applied last. Nothing private. */
export async function GET() {
  try {
    const r = await one<{ name: string | null }>("select max(name) as name from schema_migrations");
    return Response.json({ ok: true, schema: r?.name ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
