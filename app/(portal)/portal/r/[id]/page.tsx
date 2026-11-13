import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PortalChat, PortalReply } from "@/components/Portal";
import { isImage, sizeLabel } from "@/lib/attach-rules";
import { diffDays, fmtDay, fmtStamp, todayISO } from "@/lib/time";
import { requireVendor } from "@/lib/vendor-auth";
import { rqRef } from "@/lib/vendor-labels";
import { portalRfq } from "@/lib/vendors";

export const metadata: Metadata = { title: "Request" };
export const dynamic = "force-dynamic";

export default async function PortalRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await requireVendor();
  const r = await portalRfq(v.vendor_id, id);
  if (!r) notFound();
  const today = todayISO();
  const late = r.result === "open" && r.state === "invited" && !!r.reply_by && diffDays(r.reply_by, today) < 0;
  const viewable = (m: string) => m === "application/pdf" || isImage(m);
  const files = (mine: boolean) =>
    r.files.filter((f) => f.mine === mine).map((f) => (
      <a key={f.id} className="file-chip" href={`/vendors/file/${f.id}${viewable(f.mime) ? "" : "?download"}`} target={viewable(f.mime) ? "_blank" : undefined} rel="noopener noreferrer">
        <Icon name="file" size={14} />
        <span className="file-n">{f.name}</span>
        <span className="file-s">{sizeLabel(f.size)}</span>
      </a>
    ));
  return (
    <div className="page-in ap-page">
      <Link className="back" href="/portal">
        <Icon name="back" size={15} />
        All requests
      </Link>
      <header className="ph">
        <div>
          <p className="ap-ref">
            <span className="cid">{rqRef(r.id)}</span>
          </p>
          <h1 className="h1">{r.title}</h1>
          <p className="lede">
            {r.by} at Agthia asked on {fmtStamp(r.created_at)}
            {r.reply_by && (
              <>
                {" · "}
                <span className={late ? "ap-late" : undefined}>reply by {fmtDay(r.reply_by)}</span>
              </>
            )}
          </p>
        </div>
      </header>
      <PortalReply id={r.id} result={r.result} today={today} quote={{ state: r.state, price: r.price, currency: r.currency, validUntil: r.valid_until ?? "", readyOn: r.ready_on ?? "", note: r.note ?? "", declineReason: r.decline_reason }} />
      <div className="rq-grid">
        <section className="panel" aria-label="The request">
          <div className="panel-h">
            <h2>The request</h2>
          </div>
          <div className="ap-doc-b">
            {r.fields.length > 0 && (
              <dl className="rq-fields">
                {r.fields.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{/^\d{4}-\d\d-\d\d$/.test(f.value) ? fmtDay(f.value) : f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {r.notes && <p className="ap-body">{r.notes}</p>}
            {r.files.some((f) => !f.mine) && <div className="files">{files(false)}</div>}
            {r.files.some((f) => f.mine) && (
              <>
                <p className="small muted">Files you sent</p>
                <div className="files">{files(true)}</div>
              </>
            )}
            {r.state === "quoted" && (r.note || r.ready_on || r.valid_until) && (
              <p className="small muted">
                Your quote details: {[r.ready_on && `can do ${fmtDay(r.ready_on)}`, r.valid_until && `valid until ${fmtDay(r.valid_until)}`, r.note].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </section>
        <section className="panel rq-chat-p" aria-label="Chat with Agthia">
          <div className="panel-h">
            <h2>Chat with Agthia</h2>
          </div>
          <PortalChat id={r.id} canWrite={r.result !== "cancelled" && r.result !== "lost"} />
        </section>
      </div>
    </div>
  );
}
