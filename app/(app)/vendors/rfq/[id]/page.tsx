import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RfqBoard, type RfqView } from "@/components/Vendors";
import { isImage, sizeLabel } from "@/lib/attach-rules";
import { getViewer } from "@/lib/auth";
import { caseRef } from "@/lib/status";
import { diffDays, fmtDay, fmtStamp, todayISO } from "@/lib/time";
import { nextStep, RFQ_STATUS, rqRef } from "@/lib/vendor-labels";
import { ViewOnlyProvider } from "@/components/work";
import { getRfq, listVendors } from "@/lib/vendors";
import { JobBoard } from "@/components/Jobs";
import { getJob, listStepTemplates } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: /^\d+$/.test(id) ? rqRef(id) : "Request" };
}

const viewable = (mime: string) => mime === "application/pdf" || isImage(mime);

export default async function RfqPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v } = await searchParams;
  const { me, real, viewOnly: vo, viewingAs } = await getViewer();
  const admin = real.role === "admin" && !viewingAs;
  const [r, vendors] = await Promise.all([getRfq(me, id, admin), listVendors(admin)]);
  if (!r) notFound();
  const sandbox = admin && r.test;
  const isJob = ["awarded", "confirmed", "done"].includes(r.status);
  const [job, stepTemplates] = await Promise.all([isJob ? getJob(r.id) : Promise.resolve([]), listStepTemplates()]);
  const won = r.quotes.find((x) => x.vendor_id === r.awarded_vendor_id);
  const viewOnly = vo && !sandbox;
  const quotedN = r.quotes.filter((x) => x.state === "quoted").length;
  const next = nextStep({ status: r.status, vendors: r.quotes.length, replied: r.quotes.filter((x) => x.state !== "invited").length, quoted: quotedN, winner: won?.vendor, ms_total: job.length, ms_done: job.filter((m) => m.done_at).length, ms_next: job.find((m) => !m.done_at)?.title ?? null, problems: job.filter((m) => m.problem).length });
  const today = todayISO();
  const late = r.status === "open" && !!r.reply_by && diffDays(r.reply_by, today) < 0;
  const view: RfqView = {
    id: r.id,
    title: r.title,
    fields: r.fields,
    notes: r.notes,
    status: r.status,
    replyBy: r.reply_by ?? "",
    awardedVendorId: r.awarded_vendor_id,
    awardByName: r.award_by === me.id ? "You" : r.award_by_name,
    awardNote: r.award_note,
    canManage: !viewOnly && (sandbox || me.role === "lead" || r.created_by === me.id),
    lead: sandbox || me.role === "lead",
    sandbox,
    quotes: r.quotes.map((x) => ({
      vendor_id: x.vendor_id,
      vendor: x.vendor,
      state: x.state,
      price: x.price,
      currency: x.currency,
      validUntil: x.valid_until ? fmtDay(x.valid_until) : null,
      readyOn: x.ready_on ? fmtDay(x.ready_on) : null,
      readyISO: x.ready_on,
      note: x.note,
      declineReason: x.decline_reason,
      quotedAt: x.quoted_at ? fmtStamp(x.quoted_at) : null,
      changes: x.changes,
      unread: viewOnly ? 0 : x.unread,
      people: x.people,
      files: x.files.map((f) => ({ id: f.id, name: f.name, size: sizeLabel(f.size), view: viewable(f.mime) })),
    })),
  };
  return (
    <div className="page-in ap-page">
      <Link className="back no-print" href="/vendors">
        <Icon name="back" size={15} />
        Vendors
      </Link>
      <header className="ph">
        <div>
          <p className="ap-ref">
            <span className="cid">{rqRef(r.id)}</span>
            <span className={`ap-st rq-${r.status}`}>{RFQ_STATUS[r.status]}</span>
            {r.test && <span className="ap-ver sbx">Sandbox · only you see this, and you can try everything</span>}
          </p>
          <h1 className="h1">{r.title}</h1>
          <p className="lede">
            {r.created_by === me.id ? "You" : r.by} asked on {fmtStamp(r.created_at)}
            {r.reply_by && (
              <>
                {" · "}
                <span className={late ? "ap-late" : undefined}>reply by {fmtDay(r.reply_by)}</span>
              </>
            )}
            {r.case_id && (
              <>
                {" · for case "}
                <Link href={`/cases/${r.case_id}`}>{caseRef(r.case_id)}</Link>
              </>
            )}
          </p>
          <p className="rq-next big">
            <Icon name="clock" size={14} />
            Next step: {next}
          </p>
        </div>
      </header>

      <section className="panel" aria-label="What was asked">
        <div className="panel-h">
          <h2>What was asked</h2>
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
          {r.files.length > 0 && (
            <div className="files">
              {r.files.map((f) => (
                <a key={f.id} className="file-chip" href={`/vendors/file/${f.id}${viewable(f.mime) ? "" : "?download"}`} target={viewable(f.mime) ? "_blank" : undefined} rel="noopener noreferrer">
                  <Icon name="file" size={14} />
                  <span className="file-n">{f.name}</span>
                  <span className="file-s">{sizeLabel(f.size)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {isJob && (
        <JobBoard
          rfqId={r.id}
          side="team"
          attachKey="apv"
          canAct={!viewOnly}
          canEdit={view.canManage}
          running={r.status === "confirmed"}
          closed={r.status === "done"}
          due={r.job_due ? fmtDay(r.job_due) : null}
          late={r.status !== "done" && !!r.job_due && diffDays(r.job_due, today) < 0}
          closing={{ rating: r.rating, finalCost: r.final_cost, note: r.close_note, currency: won?.currency ?? "AED" }}
          steps={job.map((m) => ({
            id: m.id,
            title: m.title,
            needsPod: m.needs_pod,
            doneAt: m.done_at ? fmtStamp(m.done_at) : null,
            doneBy: m.done_by,
            doneNote: m.done_note,
            problem: m.problem,
            problemEta: m.problem_eta ? fmtDay(m.problem_eta) : null,
            files: m.files.map((f) => ({ id: f.id, name: f.name, size: sizeLabel(f.size), view: viewable(f.mime) })),
            comments: m.comments.map((c) => ({ id: c.id, who: c.who, side: c.side, body: c.body, at: fmtStamp(c.at) })),
          }))}
        />
      )}
      <ViewOnlyProvider value={viewOnly}>
        <RfqBoard stepTemplates={stepTemplates} today={today} rfq={view} vendors={vendors.filter((x) => x.test === r.test).map((x) => ({ id: x.id, name: x.name, services: x.services, people: x.people, status: x.status }))} initialVendor={v} />
      </ViewOnlyProvider>
    </div>
  );
}
