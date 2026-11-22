// The freight rate book: who can use it, and loading enquiries, quotes and the flat list used for search.
import type { User } from "@/lib/auth";
import { one, q } from "@/lib/db";
import type { Charge, Equip, Fx, Mode, QuoteState, Service, UnitRate } from "@/lib/rate-calc";

/** Rates is one person's working tool (switched on by the Admin); Leads and the Admin can look. Everyone else: nothing. */
export const ratesAccess = (u: User) => ({ view: !!u.can_rates || u.role === "lead" || u.role === "admin", manage: !!u.can_rates && u.role !== "admin" });

export type Settings = { fx: Fx; charges: [string, "container" | "shipment"][] };
export async function rateSettings(): Promise<Settings> {
  const r = await one<Settings>("select fx, charges from rate_settings where id = 1");
  return r ?? { fx: { AED: 1, USD: 3.685 }, charges: [] };
}

export type Supplier = { id: string; name: string; contact: string; email: string; phone: string; notes: string; quotes: number; declined: number; awarded: number; last_on: string | null };
export const listSuppliers = () =>
  q<Supplier>(
    `select s.id::text as id, s.name, s.contact, s.email, s.phone, s.notes,
            (select count(*)::int from rate_quotes x where x.supplier_id = s.id and x.replaced_at is null and x.state = 'quoted') as quotes,
            (select count(*)::int from rate_quotes x where x.supplier_id = s.id and x.replaced_at is null and x.state = 'declined') as declined,
            (select count(*)::int from rate_requests r join rate_quotes x on x.id = r.awarded_quote_id where x.supplier_id = s.id) as awarded,
            (select max(x.quoted_on)::text from rate_quotes x where x.supplier_id = s.id and x.replaced_at is null) as last_on
       from rate_suppliers s order by lower(s.name)`,
  );

export type RateRequest = {
  id: string; title: string; origin: string; origin_country: string; origin_port: string; destination: string; destination_country: string; destination_port: string;
  commodity: string; mode: Mode; service: Service; incoterm: string; equipment: Equip[]; notes: string; requested_on: string; status: "open" | "awarded" | "closed";
  awarded_quote_id: string | null; award_reason: string | null; pr_number: string | null; po_buffer_pct: number; approval_id: string | null; created_at: Date; by: string | null;
};
export type RateQuote = {
  id: string; request_id: string; supplier_id: string; supplier: string; state: QuoteState; quoted_on: string; currency: string; rates: UnitRate[]; charges: Charge[];
  carrier: string; routing: string; transit: string; free_time: string; valid_until: string | null; remarks: string; exclusions: string; decline_reason: string; negotiated: boolean;
  replaces_id: string | null; replaced_at: Date | null; created_at: Date;
};
const REQ = `r.id::text as id, r.title, r.origin, r.origin_country, r.origin_port, r.destination, r.destination_country, r.destination_port, r.commodity, r.mode, r.service, r.incoterm,
             r.equipment, r.notes, r.requested_on::text as requested_on, r.status, r.awarded_quote_id::text as awarded_quote_id, r.award_reason, r.pr_number, r.po_buffer_pct::float as po_buffer_pct,
             r.approval_id::text as approval_id, r.created_at, u.name as by`;
const QUO = `x.id::text as id, x.request_id::text as request_id, x.supplier_id::text as supplier_id, s.name as supplier, x.state, x.quoted_on::text as quoted_on, x.currency, x.rates, x.charges,
             x.carrier, x.routing, x.transit, x.free_time, x.valid_until::text as valid_until, x.remarks, x.exclusions, x.decline_reason, x.negotiated,
             x.replaces_id::text as replaces_id, x.replaced_at, x.created_at`;

export const listRequests = () => q<RateRequest>(`select ${REQ} from rate_requests r left join users u on u.id = r.created_by order by r.requested_on desc, r.id desc limit 2000`);
/** Every current quote (corrections replaced by their newer version are left out). */
export const listQuotes = () => q<RateQuote>(`select ${QUO} from rate_quotes x join rate_suppliers s on s.id = x.supplier_id where x.replaced_at is null order by x.quoted_on desc, x.id desc limit 10000`);

export type RateFile = { id: string; quote_id: string | null; name: string; mime: string; size: number };
export async function getRequest(id: string) {
  if (!/^\d{1,12}$/.test(id)) return null;
  const r = await one<RateRequest>(`select ${REQ} from rate_requests r left join users u on u.id = r.created_by where r.id = $1`, [id]);
  if (!r) return null;
  const [quotes, files, approval] = await Promise.all([
    q<RateQuote>(`select ${QUO} from rate_quotes x join rate_suppliers s on s.id = x.supplier_id where x.request_id = $1 order by x.id`, [id]),
    q<RateFile>("select id::text as id, quote_id::text as quote_id, name, mime, size from rate_files where request_id = $1 order by id", [id]),
    r.approval_id ? one<{ status: string }>("select status from approvals where id = $1", [r.approval_id]) : Promise.resolve(null),
  ]);
  return { ...r, quotes: quotes.filter((x) => !x.replaced_at), old: quotes.filter((x) => x.replaced_at), files, approval_status: approval?.status ?? null };
}

export type RateDoc = { id: string; title: string; route: string; supplier: string; doc_date: string | null; notes: string; name: string; mime: string; size: number; created_at: Date; by: string | null };
export const listDocs = () =>
  q<RateDoc>(`select d.id::text as id, d.title, d.route, d.supplier, d.doc_date::text as doc_date, d.notes, d.name, d.mime, d.size::float as size, d.created_at, u.name as by
                from rate_docs d left join users u on u.id = d.created_by order by coalesce(d.doc_date, d.created_at::date) desc, d.id desc limit 3000`);

export type RateNote = { id: string; body: string; page: string; status: "new" | "working" | "done"; reply: string | null; created_at: Date; by: string | null };
export const listFeedback = () =>
  q<RateNote>(`select f.id::text as id, f.body, f.page, f.status, f.reply, f.created_at, u.name as by from rate_feedback f left join users u on u.id = f.user_id order by f.id desc limit 200`);
