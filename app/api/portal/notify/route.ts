import { q } from "@/lib/db";
import { getVendorUser } from "@/lib/vendor-auth";

export const dynamic = "force-dynamic";

/** New things for this vendor since `after`: requests, messages from the team, awards. */
export async function GET(req: Request) {
  const v = await getVendorUser();
  if (!v) return Response.json({ error: "Sign in first." }, { status: 401 });
  const raw = new URL(req.url).searchParams.get("after") ?? "";
  const after = /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(raw) ? raw : null;
  const [items, count, now] = await Promise.all([
    after
      ? q<{ id: string; rfq_id: string; title: string; who: string | null; kind: string; body: string }>(
          `select m.id::text as id, r.id::text as rfq_id, r.title, u.name as who, m.kind, left(m.body, 160) as body
             from rfq_messages m join rfqs r on r.id = m.rfq_id left join users u on u.id = m.user_id
            where m.vendor_id = $1 and m.kind <> 'internal' and m.vendor_user_id is null and m.created_at > $2::timestamptz order by m.id desc limit 5`,
          [v.vendor_id, after],
        )
      : Promise.resolve([]),
    q<{ n: number }>(
      `select count(*)::int as n from rfq_messages m join rfq_vendors rv on rv.rfq_id = m.rfq_id and rv.vendor_id = m.vendor_id
        where m.vendor_id = $1 and m.kind <> 'internal' and m.vendor_user_id is null and m.created_at > coalesce(rv.vendor_read_at, '-infinity')`,
      [v.vendor_id],
    ),
    q<{ now: Date }>("select now() as now"),
  ]);
  return Response.json({ now: new Date(now[0].now).toISOString(), items: items.reverse(), unread: count[0]?.n ?? 0 }, { headers: { "Cache-Control": "private, no-store" } });
}
