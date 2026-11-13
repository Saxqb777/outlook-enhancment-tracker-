// Vendors and quote requests: loading lists and full records for the team and for the vendor portal.
import type { User } from "@/lib/auth";
import { one, q } from "@/lib/db";
import type { Field, QuoteState, RfqStatus } from "@/lib/vendor-labels";

const isId = (v: unknown) => /^\d{1,12}$/.test(String(v));
/** Who gets alerts for a request: the person who made it and every Lead. */
const WATCH = `(r.created_by = $1 or exists (select 1 from users w where w.id = $1 and w.role = 'lead'))`;
const UNREAD = `m.user_id is distinct from $1 and m.created_at > coalesce((select x.last_read_at from rfq_reads x where x.rfq_id = m.rfq_id and x.vendor_id = m.vendor_id and x.user_id = $1), '-infinity')`;

export type VendorRow = { id: string; name: string; services: string[]; areas: string; phone: string; status: "active" | "off"; people: number; asked: number; quoted: number; declined: number; won: number; reply_hours: number | null; has_link: boolean };

export async function listVendors(): Promise<VendorRow[]> {
  return q<VendorRow>(
    `select v.id::text as id, v.name, v.services, v.areas, v.phone, v.status,
            (select count(*)::int from vendor_users u where u.vendor_id = v.id and u.status = 'active') as people,
            (select count(*)::int from rfq_vendors rv where rv.vendor_id = v.id) as asked,
            (select count(*)::int from rfq_vendors rv where rv.vendor_id = v.id and rv.state = 'quoted') as quoted,
            (select count(*)::int from rfq_vendors rv where rv.vendor_id = v.id and rv.state = 'declined') as declined,
            (select count(*)::int from rfqs r where r.awarded_vendor_id = v.id and r.status in ('awarded', 'confirmed', 'done')) as won,
            (select round(avg(extract(epoch from (rv.quoted_at - rv.added_at)) / 3600)::numeric, 1)::float from rfq_vendors rv where rv.vendor_id = v.id and rv.quoted_at is not null) as reply_hours,
            (v.invite_hash is not null and v.invite_expires > now()) as has_link
       from vendors v order by (v.status = 'active') desc, lower(v.name)`,
  );
}

export type VendorPerson = { id: string; name: string; email: string; status: string; last_login_at: Date | null };
export type PastQuote = { rfq_id: string; title: string; fields: Field[]; status: RfqStatus; state: QuoteState; price: string | null; currency: string | null; won: boolean; created_at: Date };

export async function getVendor(id: string) {
  if (!isId(id)) return null;
  const v = (await listVendors()).find((x) => x.id === id);
  if (!v) return null;
  const [extra, people, past] = await Promise.all([
    one<{ notes: string; created_at: Date; by: string | null }>("select v.notes, v.created_at, u.name as by from vendors v left join users u on u.id = v.created_by where v.id = $1", [id]),
    q<VendorPerson>("select id, name, email, status, last_login_at from vendor_users where vendor_id = $1 order by lower(name)", [id]),
    q<PastQuote>(
      `select r.id::text as rfq_id, r.title, r.fields, r.status, rv.state, rv.price::text as price, rv.currency, (r.awarded_vendor_id = rv.vendor_id and r.status in ('awarded', 'confirmed', 'done')) as won, r.created_at
         from rfq_vendors rv join rfqs r on r.id = rv.rfq_id where rv.vendor_id = $1 order by r.id desc limit 100`,
      [id],
    ),
  ]);
  return { ...v, notes: extra?.notes ?? "", created_at: extra?.created_at ?? new Date(), by: extra?.by ?? null, persons: people, past };
}

export type RfqRow = {
  id: string; title: string; status: RfqStatus; reply_by: string | null; created_at: Date; created_by: string; by: string; fields: Field[];
  vendors: number; replied: number; best: string | null; best_currency: string | null; winner: string | null; unread: number;
};

export async function listRfqs(me: User): Promise<RfqRow[]> {
  return q<RfqRow>(
    `select r.id::text as id, r.title, r.status, r.reply_by::text as reply_by, r.created_at, r.created_by, u.name as by, r.fields,
            (select count(*)::int from rfq_vendors rv where rv.rfq_id = r.id) as vendors,
            (select count(*)::int from rfq_vendors rv where rv.rfq_id = r.id and rv.state <> 'invited') as replied,
            b.price::text as best, b.currency as best_currency,
            (select v.name from vendors v where v.id = r.awarded_vendor_id) as winner,
            (select count(*)::int from rfq_messages m where m.rfq_id = r.id and ${WATCH} and ${UNREAD}) as unread
       from rfqs r join users u on u.id = r.created_by
       left join lateral (select rv.price, rv.currency from rfq_vendors rv where rv.rfq_id = r.id and rv.state = 'quoted' order by rv.price limit 1) b on true
      order by r.id desc limit 500`,
    [me.id],
  );
}

export type RfqQuote = {
  vendor_id: string; vendor: string; vendor_status: string; state: QuoteState; price: string | null; currency: string | null; valid_until: string | null; ready_on: string | null;
  note: string | null; decline_reason: string | null; quoted_at: Date | null; changes: number; unread: number; people: number;
  files: { id: string; name: string; mime: string; size: number }[];
};
export type RfqFull = {
  id: string; title: string; fields: Field[]; notes: string; status: RfqStatus; reply_by: string | null; created_at: Date; closed_at: Date | null; created_by: string; by: string;
  case_id: string | null; case_subject: string | null; awarded_vendor_id: string | null; award_by: string | null; award_by_name: string | null; award_note: string | null; awarded_at: Date | null;
  files: { id: string; name: string; mime: string; size: number }[];
  quotes: RfqQuote[];
};

export async function getRfq(me: User, id: string): Promise<RfqFull | null> {
  if (!isId(id)) return null;
  const r = await one<Omit<RfqFull, "files" | "quotes">>(
    `select r.id::text as id, r.title, r.fields, r.notes, r.status, r.reply_by::text as reply_by, r.created_at, r.closed_at, r.created_by, u.name as by,
            r.case_id::text as case_id, c.subject as case_subject, r.awarded_vendor_id::text as awarded_vendor_id, r.award_by, a.name as award_by_name, r.award_note, r.awarded_at
       from rfqs r join users u on u.id = r.created_by left join users a on a.id = r.award_by left join cases c on c.id = r.case_id where r.id = $1`,
    [id],
  );
  if (!r) return null;
  const [files, quotes] = await Promise.all([
    q<{ id: string; vendor_id: string | null; name: string; mime: string; size: number }>("select id::text as id, vendor_id::text as vendor_id, name, mime, size from rfq_files where rfq_id = $1 order by id", [id]),
    q<Omit<RfqQuote, "files">>(
      `select v.id::text as vendor_id, v.name as vendor, v.status as vendor_status, rv.state, rv.price::text as price, rv.currency, rv.valid_until::text as valid_until, rv.ready_on::text as ready_on,
              rv.note, rv.decline_reason, rv.quoted_at,
              greatest((select count(*)::int from rfq_quotes h where h.rfq_id = rv.rfq_id and h.vendor_id = rv.vendor_id) - 1, 0) as changes,
              (select count(*)::int from rfq_messages m where m.rfq_id = rv.rfq_id and m.vendor_id = rv.vendor_id and ${UNREAD}) as unread,
              (select count(*)::int from vendor_users p where p.vendor_id = v.id and p.status = 'active') as people
         from rfq_vendors rv join vendors v on v.id = rv.vendor_id where rv.rfq_id = $2 order by (rv.state = 'quoted') desc, rv.price nulls last, lower(v.name)`,
      [me.id, id],
    ),
  ]);
  return { ...r, files: files.filter((f) => !f.vendor_id), quotes: quotes.map((x) => ({ ...x, files: files.filter((f) => f.vendor_id === x.vendor_id) })) };
}

export type RfqMessage = { id: string; kind: "text" | "system" | "internal"; body: string; at: Date; who: string; side: "team" | "vendor" };

/** One request-and-vendor chat. Vendors never get the team's internal notes. */
export async function rfqThread(rfqId: string, vendorId: string, forVendor: boolean): Promise<RfqMessage[]> {
  return q<RfqMessage>(
    `select m.id::text as id, m.kind, m.body, m.created_at as at, coalesce(u.name, vu.name, 'System') as who, case when m.vendor_user_id is not null then 'vendor' else 'team' end as side
       from rfq_messages m left join users u on u.id = m.user_id left join vendor_users vu on vu.id = m.vendor_user_id
      where m.rfq_id = $1 and m.vendor_id = $2 ${forVendor ? "and m.kind <> 'internal'" : ""} order by m.id limit 500`,
    [rfqId, vendorId],
  );
}

/** For the Vendors tab: unread vendor activity on requests this person watches, plus awards waiting for a Lead. */
export async function vendorBadge(me: User): Promise<number> {
  const r = await one<{ n: number }>(
    `select (select count(*)::int from rfq_messages m join rfqs r on r.id = m.rfq_id where ${WATCH} and ${UNREAD})
          + (select count(*)::int from rfqs r where r.status = 'pending_award' and exists (select 1 from users w where w.id = $1 and w.role = 'lead')) as n`,
    [me.id],
  );
  return r?.n ?? 0;
}

export type Template = { id: string; name: string; fields: string[] };
export const listTemplates = () => q<Template>("select id::text as id, name, fields from rfq_templates order by lower(name)");

// ------------------------------------------------------------------ vendor portal

const VUNREAD = `(select count(*)::int from rfq_messages m where m.rfq_id = rv.rfq_id and m.vendor_id = rv.vendor_id and m.kind <> 'internal' and m.vendor_user_id is null and m.created_at > coalesce(rv.vendor_read_at, '-infinity'))`;
/** What the vendor is told about the outcome: only their own result. */
const RESULT = `case when r.status = 'cancelled' then 'cancelled'
                     when r.status in ('awarded', 'confirmed', 'done') and r.awarded_vendor_id = rv.vendor_id then (case r.status when 'awarded' then 'won' else r.status end)
                     when r.status in ('awarded', 'confirmed', 'done') then 'lost' else 'open' end`;

export type PortalRow = { id: string; title: string; fields: Field[]; reply_by: string | null; created_at: Date; state: QuoteState; price: string | null; currency: string | null; result: string; unread: number };

export async function portalList(vendorId: string): Promise<PortalRow[]> {
  return q<PortalRow>(
    `select r.id::text as id, r.title, r.fields, r.reply_by::text as reply_by, r.created_at, rv.state, rv.price::text as price, rv.currency, ${RESULT} as result, ${VUNREAD} as unread
       from rfq_vendors rv join rfqs r on r.id = rv.rfq_id where rv.vendor_id = $1 order by r.id desc limit 300`,
    [vendorId],
  );
}

export type PortalRfq = PortalRow & { notes: string; by: string; valid_until: string | null; ready_on: string | null; note: string | null; decline_reason: string | null; files: { id: string; name: string; mime: string; size: number; mine: boolean }[] };

export async function portalRfq(vendorId: string, id: string): Promise<PortalRfq | null> {
  if (!isId(id)) return null;
  const r = await one<Omit<PortalRfq, "files">>(
    `select r.id::text as id, r.title, r.fields, r.notes, r.reply_by::text as reply_by, r.created_at, u.name as by, rv.state, rv.price::text as price, rv.currency,
            rv.valid_until::text as valid_until, rv.ready_on::text as ready_on, rv.note, rv.decline_reason, ${RESULT} as result, ${VUNREAD} as unread
       from rfq_vendors rv join rfqs r on r.id = rv.rfq_id join users u on u.id = r.created_by where rv.vendor_id = $1 and r.id = $2`,
    [vendorId, id],
  );
  if (!r) return null;
  const files = await q<PortalRfq["files"][number]>("select id::text as id, name, mime, size, (vendor_id is not null) as mine from rfq_files where rfq_id = $1 and (vendor_id is null or vendor_id = $2) order by id", [id, vendorId]);
  return { ...r, files };
}

/** A file on a request: the team sees all of them; a vendor sees the request's documents and their own. */
export async function rfqFile(fileId: string, vendorId: string | null) {
  if (!isId(fileId)) return null;
  return one<{ name: string; mime: string; storage: string; url: string }>(
    `select f.name, f.mime, f.storage, f.url from rfq_files f
      where f.id = $1 and ($2::bigint is null or ((f.vendor_id is null or f.vendor_id = $2) and exists (select 1 from rfq_vendors rv where rv.rfq_id = f.rfq_id and rv.vendor_id = $2)))`,
    [fileId, vendorId],
  );
}
