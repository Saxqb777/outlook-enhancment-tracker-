import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, Icon } from "@/components/Icon";
import { PersonToggle, VendorPersonReset, VendorTools } from "@/components/Vendors";
import { viewVendor } from "@/app/actions/admin";
import { getViewer } from "@/lib/auth";
import { fmtShort, fmtWhen, todayISO } from "@/lib/time";
import { money, QUOTE_STATE, rqRef } from "@/lib/vendor-labels";
import { getVendor } from "@/lib/vendors";

export const metadata: Metadata = { title: "Vendor" };
export const dynamic = "force-dynamic";

const val = (fields: { label: string; value: string }[], label: string) => fields.find((f) => f.label.toLowerCase() === label)?.value ?? "";

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me, real, viewOnly, viewingAs } = await getViewer();
  const admin = real.role === "admin" && !viewingAs;
  const v = await getVendor(id, admin);
  if (!v) notFound();
  const today = todayISO();
  const prices = v.past.filter((p) => p.state === "quoted" && p.price);
  const cur = prices[0]?.currency ?? null;
  const same = prices.filter((p) => p.currency === cur);
  const avg = same.length ? same.reduce((n, p) => n + Number(p.price), 0) / same.length : null;
  return (
    <div className="page-in ap-page">
      <Link className="back" href="/vendors?tab=vendors">
        <Icon name="back" size={15} />
        Vendors
      </Link>
      <header className="ph">
        <div>
          <p className="ap-ref">
            <span className={`ap-st ${v.status === "active" ? (v.people ? "signed" : "open") : "cancelled"}`}>{v.status === "active" ? (v.people ? "Active" : "Invited, not joined yet") : "Access off"}</span>
          </p>
          <h1 className="h1">
            {v.name}
            {v.test && <span className="ap-ver sbx">Sandbox</span>}
          </h1>
          <p className="lede">
            {v.services.join(", ") || "No type set"}
            {v.areas && <> · {v.areas}</>}
            {v.phone && <> · {v.phone}</>}
          </p>
        </div>
      </header>
      {admin && (
        <form action={viewVendor} className="ap-tools">
          <input type="hidden" name="vendorId" value={v.id} />
          <button className="btn btn-primary" type="submit">
            <Icon name="eye" size={15} />
            See their portal
          </button>
          <span className="hint">{v.test ? "Sandbox vendor: you can reply, quote and chat as them." : "Shows the portal exactly as this vendor sees it. View only."}</span>
        </form>
      )}
      {(!viewOnly || admin) && <VendorTools vendor={{ id: v.id, status: v.status, name: v.name, services: v.services, areas: v.areas, phone: v.phone, notes: v.notes }} lead={me.role === "lead"} />}

      <section className="stats" aria-label="Scorecard">
        <div className="stat">
          <span className="lab">Requests sent</span>
          <span className="val">{v.asked}</span>
          <span className="ctx">{v.quoted} quoted · {v.declined} couldn&apos;t</span>
        </div>
        <div className="stat">
          <span className="lab">Jobs won</span>
          <span className="val">{v.won}</span>
          <span className="ctx">{v.quoted ? `${Math.round((v.won / v.quoted) * 100)}% of their quotes` : "no quotes yet"}</span>
        </div>
        <div className="stat">
          <span className="lab">Replies in</span>
          <span className="val">{v.reply_hours == null ? "–" : v.reply_hours < 1 ? "<1 h" : `${Math.round(v.reply_hours)} h`}</span>
          <span className="ctx">on average</span>
        </div>
        <div className="stat">
          <span className="lab">Jobs finished</span>
          <span className="val">{v.jobs_done}</span>
          <span className="ctx">
            {v.timed ? `${Math.round((v.on_time / v.timed) * 100)}% on time` : "no dated jobs yet"}
            {v.rating != null ? ` · rated ${v.rating} of 5` : ""}
          </span>
        </div>
        <div className="stat">
          <span className="lab">Average quote</span>
          <span className="val">{avg == null ? "–" : money(Math.round(avg), cur)}</span>
          <span className="ctx">{same.length ? `across ${same.length} quote${same.length === 1 ? "" : "s"}` : "no quotes yet"}</span>
        </div>
      </section>

      <div className="ap-grid">
        <section className="panel" aria-label="Past requests">
          <div className="panel-h">
            <h2>
              Requests and prices <span className="count">{v.past.length}</span>
            </h2>
          </div>
          <div className="list">
            {v.past.map((p) => (
              <Link key={p.rfq_id} className="aprow vnpast" href={`/vendors/rfq/${p.rfq_id}?v=${v.id}`}>
                <span className="cid">{rqRef(p.rfq_id)}</span>
                <span className="ap-main">
                  <span className="ap-title">{p.title}</span>
                  <span className="ap-sub">
                    <span>{fmtShort(todayISO(new Date(p.created_at)))}</span>
                    {(val(p.fields, "from") || val(p.fields, "to")) && <span>{[val(p.fields, "from"), val(p.fields, "to")].filter(Boolean).join(" → ")}</span>}
                  </span>
                </span>
                <span className="rq-best">{p.state === "quoted" ? money(p.price, p.currency) : ""}</span>
                <span className="ap-end">
                  <span className={`ap-st ${p.won ? "signed" : p.state === "declined" ? "cancelled" : "open"}`}>{p.won ? "Won" : QUOTE_STATE[p.state]}</span>
                </span>
              </Link>
            ))}
            {!v.past.length && <p className="empty">No requests sent to this vendor yet.</p>}
          </div>
        </section>

        <section className="panel" aria-label="People">
          <div className="panel-h">
            <h2>
              People <span className="count">{v.persons.length}</span>
            </h2>
          </div>
          <ul className="ap-sigs">
            {v.persons.map((p) => (
              <li key={p.id} className="ap-sig">
                <div className="ap-sig-h">
                  <Avatar name={p.name} size="sm" />
                  <b>{p.name}</b>
                  {p.status !== "active" && <span className="ap-st cancelled">Off</span>}
                  {(!viewOnly || admin) && p.status === "active" && <VendorPersonReset id={p.id} />}
                  {me.role === "lead" && !viewOnly && <PersonToggle id={p.id} on={p.status === "active"} />}
                </div>
                <span className="small muted">
                  {p.email} · {p.last_login_at ? `last signed in ${fmtWhen(p.last_login_at, today)}` : "never signed in"}
                </span>
              </li>
            ))}
            {!v.persons.length && <li className="hint">Nobody has joined yet. Press Get join link and send it to your contact.</li>}
          </ul>
          {v.notes && (
            <div className="ap-doc-b">
              <p className="small muted">Team notes</p>
              <p className="ap-body">{v.notes}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
