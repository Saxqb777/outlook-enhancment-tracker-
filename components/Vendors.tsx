"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addRfqVendors, askAboutQuotes, closeRfq, createRfq, createVendor, decideAward, deleteTemplate, pickWinner, remindVendors, saveTemplate,
  sendRfqMessage, setVendorPerson, withdrawAward, setVendorStatus, updateRfq, updateVendor, vendorInviteLink, vendorResetLink, type VendorInput,
} from "@/app/actions/vendors";
import { Dialog, useAct } from "@/components/Approvals";
import { AttachPicker, useAttach } from "@/components/Attach";
import { Icon } from "@/components/Icon";
import { MilestonePlanner, startSteps } from "@/components/Jobs";
import RfqChat from "@/components/RfqChat";
import { toast, useViewOnly } from "@/components/work";
import { DEFAULT_FIELDS, money, QUOTE_STATE, RFQ_STATUS, SERVICES, SUGGESTED_FIELDS, type Field, type QuoteState, type RfqStatus } from "@/lib/vendor-labels";

const needle0 = (q: string) => q.trim().toLowerCase();
type VendorLite = { id: string; name: string; services: string[]; people: number; status: string };
type Template = { id: string; name: string; fields: string[] };

// ------------------------------------------------------------------ the custom form

/** The request's fields: start from suggestions or a saved form, rename nothing, add your own, remove what you don't need. */
export function FieldBuilder({ fields, setFields, templates }: { fields: Field[]; setFields: (f: Field[]) => void; templates?: Template[] }) {
  const [own, setOwn] = useState("");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const { busy, act } = useAct();
  const has = (label: string) => fields.some((f) => f.label.toLowerCase() === label.toLowerCase());
  const add = (label: string) => {
    const l = label.trim().replace(/\s+/g, " ").slice(0, 60);
    if (l && !has(l)) setFields([...fields, { label: l, value: "" }]);
  };
  const dateLike = (label: string) => /\bdate\b/i.test(label);
  return (
    <div className="fb">
      {templates && templates.length > 0 && (
        <div className="fb-tpl">
          <span className="hint">Saved forms:</span>
          {templates.map((t) => (
            <span key={t.id} className="fb-tpl-i">
              <button type="button" className="chip" onClick={() => setFields(t.fields.map((label) => ({ label, value: fields.find((f) => f.label === label)?.value ?? "" })))}>
                {t.name}
              </button>
              <button type="button" className="icon-btn sm" aria-label={`Delete saved form ${t.name}`} disabled={busy} onClick={() => act(() => deleteTemplate(t.id), "Saved form deleted.")}>
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="fb-rows">
        {fields.map((f, i) => (
          <div className="fb-row" key={f.label}>
            <label htmlFor={`fb-${i}`}>{f.label}</label>
            <input
              id={`fb-${i}`}
              className={`inp${dateLike(f.label) ? " inp-date" : ""}`}
              type={dateLike(f.label) ? "date" : "text"}
              value={f.value}
              maxLength={500}
              autoComplete="off"
              onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
            />
            <button type="button" className="icon-btn sm" aria-label={`Remove ${f.label}`} onClick={() => setFields(fields.filter((_, j) => j !== i))}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
        {!fields.length && <p className="hint">No fields yet. Add some below.</p>}
      </div>
      <div className="fb-add">
        <span className="hint">Add a field:</span>
        {SUGGESTED_FIELDS.filter((s) => !has(s)).map((s) => (
          <button key={s} type="button" className="chip fb-sug" onClick={() => add(s)}>
            <Icon name="plus" size={12} />
            {s}
          </button>
        ))}
      </div>
      <div className="fb-own">
        <input
          className="inp"
          value={own}
          onChange={(e) => setOwn(e.target.value)}
          placeholder="Your own field, e.g. Gate pass number"
          maxLength={60}
          aria-label="Your own field name"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(own);
              setOwn("");
            }
          }}
        />
        <button type="button" className="btn btn-sm" disabled={!own.trim()} onClick={() => (add(own), setOwn(""))}>
          Add field
        </button>
        {templates && (
          <button type="button" className="btn btn-sm btn-ghost" disabled={!fields.length} onClick={() => setSaving(true)}>
            Save this form
          </button>
        )}
      </div>
      {saving && (
        <Dialog title="Save this form" onClose={() => setSaving(false)}>
          <p className="hint">Saves the field names (not what you typed in them) so anyone can reuse the form. Saving with an existing name updates that form.</p>
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Reefer truck, local" maxLength={60} autoFocus />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={() => setSaving(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!name.trim() || busy} onClick={() => act(() => saveTemplate(name, fields.map((f) => f.label)), "Form saved.", () => setSaving(false))}>
              Save form
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function VendorPicker({ vendors, picked, setPicked }: { vendors: VendorLite[]; picked: string[]; setPicked: (v: string[]) => void }) {
  const [service, setService] = useState("");
  const services = [...new Set(vendors.flatMap((v) => v.services))].sort();
  const shown = service ? vendors.filter((v) => v.services.includes(service)) : vendors;
  return (
    <div className="vp">
      {services.length > 0 && (
        <div className="chips" role="group" aria-label="Type of vendor">
          <button type="button" className="chip all" aria-pressed={!service} onClick={() => setService("")}>
            All types
          </button>
          {services.map((s) => (
            <button key={s} type="button" className="chip all" aria-pressed={service === s} onClick={() => setService(s)}>
              {s}
            </button>
          ))}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPicked([...new Set([...picked, ...shown.map((v) => v.id)])])}>
            Select all shown
          </button>
        </div>
      )}
      <div className="vp-list">
        {shown.map((v) => {
          const on = picked.includes(v.id);
          return (
            <button key={v.id} type="button" className="vp-i" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== v.id) : [...picked, v.id])}>
              <span className="vp-check">{on && <Icon name="check" size={13} />}</span>
              <span className="vp-n">
                <b>{v.name}</b>
                <span>{v.services.join(", ") || "No type set"}{v.people === 0 ? " · nobody has joined yet" : ""}</span>
              </span>
            </button>
          );
        })}
        {!shown.length && <p className="hint">No vendors here yet. Add one from the Vendors page first.</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ new request

export function RfqNew({ vendors, templates, today, start, sandbox }: { vendors: VendorLite[]; templates: Template[]; today: string; start?: { title: string; caseId: string; caseRef: string }; sandbox?: boolean }) {
  const [title, setTitle] = useState(start?.title ?? "");
  const [fields, setFields] = useState<Field[]>(DEFAULT_FIELDS.map((label) => ({ label, value: "" })));
  const [notes, setNotes] = useState("");
  const [replyBy, setReplyBy] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const att = useAttach("apv");
  const [busy, start_] = useTransition();
  const ready = title.trim() && (fields.some((f) => f.value.trim()) || notes.trim()) && picked.length && !att.busy;
  const submit = () =>
    start_(async () => {
      setError(null);
      const r = await createRfq({ title, fields, notes, replyBy, vendorIds: picked, caseId: start?.caseId, files: att.uploaded });
      if (r && !r.ok) setError(r.error);
    });
  return (
    <form
      className="panel ap-new"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) submit();
      }}
    >
      {start && (
        <p className="hint">
          Linked to case <b>{start.caseRef}</b>.
        </p>
      )}
      <div className="field">
        <label htmlFor="rq-title">What do you need?</label>
        <input id="rq-title" className="inp inp-lg" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 2 reefer trucks, Jebel Ali to Al Ain" maxLength={200} autoComplete="off" autoFocus />
      </div>
      <div className="field">
        <label>Details</label>
        <FieldBuilder fields={fields} setFields={setFields} templates={sandbox ? undefined : templates} />
      </div>
      <div className="field">
        <label htmlFor="rq-notes">Anything else (optional)</label>
        <textarea id="rq-notes" className="inp" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
      </div>
      {!sandbox && (
        <div className="field">
          <label>Documents (optional)</label>
          <AttachPicker att={att} />
        </div>
      )}
      <div className="field ap-date">
        <label htmlFor="rq-by">Vendors should reply by (optional)</label>
        <input id="rq-by" type="date" className="inp inp-date" min={today} value={replyBy} onChange={(e) => setReplyBy(e.target.value)} />
      </div>
      <div className="field">
        <label>Send to</label>
        <VendorPicker vendors={vendors} picked={picked} setPicked={setPicked} />
        <span className="hint">Each vendor only sees their own quote and chat, never the others.</span>
      </div>
      {error && <p className="form-err">{error}</p>}
      <div className="form-f">
        <Link className="btn btn-ghost" href="/vendors">
          Cancel
        </Link>
        <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
          {busy ? "Sending…" : att.busy ? "Uploading…" : `Send to ${picked.length || ""} vendor${picked.length === 1 ? "" : "s"}`.replace("  ", " ")}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ vendor form

export function VendorForm({ vendor, onClose }: { vendor?: { id: string } & VendorInput; onClose: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<VendorInput>(vendor ?? { name: "", services: [], areas: "", phone: "", notes: "" });
  const [busy, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = vendor ? await updateVendor(vendor.id, v) : await createVendor(v);
      if (!r.ok) return toast(r.error);
      toast(vendor ? "Saved." : "Vendor added. Now send them their join link.");
      onClose();
      if (!vendor && "id" in r) router.push(`/vendors/v/${r.id}`);
      else router.refresh();
    });
  return (
    <Dialog title={vendor ? "Edit vendor" : "Add a vendor"} onClose={onClose} wide>
      <div className="field">
        <label htmlFor="vn-name">Company name</label>
        <input id="vn-name" className="inp" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={120} autoFocus autoComplete="off" />
      </div>
      <div className="field">
        <label>What they do</label>
        <div className="chips" role="group" aria-label="What they do">
          {SERVICES.map((s) => {
            const on = v.services.includes(s);
            return (
              <button key={s} type="button" className="chip all" aria-pressed={on} onClick={() => setV({ ...v, services: on ? v.services.filter((x) => x !== s) : [...v.services, s] })}>
                {s}
              </button>
            );
          })}
        </div>
      </div>
      <div className="fields-row">
        <div className="field">
          <label htmlFor="vn-areas">Areas they cover</label>
          <input id="vn-areas" className="inp" value={v.areas} onChange={(e) => setV({ ...v, areas: e.target.value })} placeholder="e.g. UAE, Oman" maxLength={300} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="vn-phone">Phone</label>
          <input id="vn-phone" className="inp" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} maxLength={60} autoComplete="off" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="vn-notes">Notes for the team (vendors don&apos;t see this)</label>
        <textarea id="vn-notes" className="inp" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={2000} />
      </div>
      <div className="form-f">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={v.name.trim().length < 2 || busy} onClick={save}>
          {vendor ? "Save" : "Add vendor"}
        </button>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Vendors home: requests + vendors

export type JobInfo = { due: string | null; late: boolean; total: number; done: number; next: string | null; problems: number };
export type RfqItem = { job?: JobInfo; id: string; ref: string; title: string; status: RfqStatus; by: string; mine: boolean; route: string; when: string; replyBy: string | null; late: boolean; vendors: number; replied: number; best: string | null; winner: string | null; unread: number; next: string; test: boolean };
export type VendorItem = { id: string; name: string; services: string[]; areas: string; status: string; people: number; test?: boolean; asked: number; quoted: number; won: number; replyHours: number | null };

const OPEN: RfqStatus[] = ["open", "pending_award"];
const JOBS: RfqStatus[] = ["awarded", "confirmed", "done"];

export function VendorsHome({ rfqs, vendors, initial, canAdd }: { rfqs: RfqItem[]; vendors: VendorItem[]; initial: "requests" | "vendors" | "jobs"; canAdd: boolean }) {
  const [tab, setTab] = useState(initial);
  const [show, setShow] = useState<"open" | "mine" | "closed" | "all">("open");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const needle = q.trim().toLowerCase();
  const [jshow, setJshow] = useState<"running" | "finished">("running");
  const tests = { open: (r: RfqItem) => OPEN.includes(r.status), mine: (r: RfqItem) => r.mine && OPEN.includes(r.status), closed: (r: RfqItem) => r.status === "cancelled", all: (r: RfqItem) => !JOBS.includes(r.status) };
  const jobs = rfqs.filter((r) => JOBS.includes(r.status));
  const jlist = needle0(q) ? jobs.filter((r) => `${r.ref} ${r.title} ${r.by} ${r.route} ${r.winner ?? ""}`.toLowerCase().includes(needle0(q))) : jobs.filter((r) => (jshow === "running" ? r.status !== "done" : r.status === "done"));
  const list = needle ? rfqs.filter((r) => `${r.ref} ${r.title} ${r.by} ${r.route} ${r.winner ?? ""}`.toLowerCase().includes(needle)) : rfqs.filter(tests[show]);
  const vlist = needle ? vendors.filter((v) => `${v.name} ${v.services.join(" ")} ${v.areas}`.toLowerCase().includes(needle)) : vendors;
  return (
    <>
      <div className="filters">
        <div className="seg" role="group" aria-label="Show">
          <button type="button" aria-pressed={tab === "requests"} onClick={() => setTab("requests")} data-tour="vn-requests">
            Requests<span className="n">{rfqs.filter(tests.open).length}</span>
          </button>
          <button type="button" aria-pressed={tab === "jobs"} onClick={() => setTab("jobs")} data-tour="vn-jobs">
            Jobs<span className="n">{jobs.filter((r) => r.status !== "done").length}</span>
          </button>
          <button type="button" aria-pressed={tab === "vendors"} onClick={() => setTab("vendors")} data-tour="vn-vendors">
            Vendors<span className="n">{vendors.length}</span>
          </button>
        </div>
        {tab === "requests" && !needle && (
          <div className="chips" role="group" aria-label="Which requests">
            {(["open", "mine", "closed", "all"] as const).map((k) => (
              <button key={k} type="button" className="chip all" aria-pressed={show === k} onClick={() => setShow(k)}>
                {k === "open" ? "Open" : k === "mine" ? "Mine" : k === "closed" ? "Closed" : "All"}
              </button>
            ))}
          </div>
        )}
        {tab === "jobs" && !needle && (
          <div className="chips" role="group" aria-label="Which jobs">
            <button type="button" className="chip all" aria-pressed={jshow === "running"} onClick={() => setJshow("running")}>
              Running
            </button>
            <button type="button" className="chip all" aria-pressed={jshow === "finished"} onClick={() => setJshow("finished")}>
              Finished
            </button>
          </div>
        )}
        {canAdd && (
          <button type="button" className="btn btn-sm" data-tour="vn-add" onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} />
            Add vendor
          </button>
        )}
        <label className="find">
          <Icon name="search" size={15} />
          <span className="sr">Search</span>
          <input type="search" placeholder={tab === "requests" ? "Search requests" : tab === "jobs" ? "Search jobs" : "Search vendors"} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </label>
      </div>

      {tab === "jobs" ? (
        <section className="panel" aria-label="Jobs">
          <div className="list">
            {jlist.map((r) => (
              <Link key={r.id} className={`aprow rqrow${r.job?.problems ? " jbad" : ""}`} href={`/vendors/rfq/${r.id}`}>
                <span className="cid">{r.ref}</span>
                <span className="ap-main">
                  <span className="ap-title">
                    {r.unread > 0 && <span className="unread-dot" title={`${r.unread} new`} />}
                    {r.title}
                    {r.test && <span className="ap-ver sbx">Sandbox</span>}
                  </span>
                  <span className="ap-sub">
                    <span>{r.winner}</span>
                    {r.route && <span>{r.route}</span>}
                  </span>
                  <span className="rq-next">
                    <Icon name="clock" size={12} />
                    {r.next}
                  </span>
                </span>
                <span className="ap-prog small">{r.job?.total ? `${r.job.done} of ${r.job.total} done` : ""}</span>
                <span className="job-bar sm" aria-hidden="true">
                  {Array.from({ length: r.job?.total ?? 0 }, (_, i) => (
                    <i key={i} className={i < (r.job?.done ?? 0) ? "on" : ""} />
                  ))}
                </span>
                <span className="ap-end">
                  {r.job?.due && r.status !== "done" && <span className={`due${r.job.late ? " late" : ""}`}>By {r.job.due}</span>}
                  <span className={`ap-st ${r.job?.problems ? "rejected" : `rq-${r.status}`}`}>{r.job?.problems ? "Problem" : r.status === "awarded" ? "To confirm" : r.status === "confirmed" ? "Running" : "Closed"}</span>
                </span>
              </Link>
            ))}
            {!jlist.length && <p className="empty">{needle ? "Nothing matches that search." : jshow === "running" ? "No jobs running. A request becomes a job when a vendor is awarded." : "No finished jobs yet."}</p>}
          </div>
        </section>
      ) : tab === "requests" ? (
        <section className="panel" aria-label="Requests">
          <div className="list">
            {list.map((r) => (
              <Link key={r.id} className="aprow rqrow" href={`/vendors/rfq/${r.id}`}>
                <span className="cid">{r.ref}</span>
                <span className="ap-main">
                  <span className="ap-title">
                    {r.unread > 0 && <span className="unread-dot" title={`${r.unread} new`} />}
                    {r.title}
                    {r.test && <span className="ap-ver sbx">Sandbox</span>}
                  </span>
                  <span className="ap-sub">
                    <span>{r.mine ? "You" : r.by}</span>
                    <span>{r.when}</span>
                    {r.route && <span>{r.route}</span>}
                  </span>
                  <span className="rq-next">
                    <Icon name="clock" size={12} />
                    {r.next}
                  </span>
                </span>
                <span className="ap-prog small">
                  {r.replied} of {r.vendors} replied
                </span>
                <span className="rq-best">{r.winner ? r.winner : r.best ? `from ${r.best}` : ""}</span>
                <span className="ap-end">
                  {r.status === "open" && r.replyBy && <span className={`due${r.late ? " late" : ""}`}>By {r.replyBy}</span>}
                  <span className={`ap-st rq-${r.status}`}>{RFQ_STATUS[r.status]}</span>
                </span>
              </Link>
            ))}
            {!list.length && <p className="empty">{needle ? "Nothing matches that search." : rfqs.length ? "No requests here." : vendors.length ? "No requests yet. Press New request to ask vendors for a price." : "Start by pressing Add vendor. Then send them a request for a price."}</p>}
          </div>
        </section>
      ) : (
        <section className="panel" aria-label="Vendors">
          <div className="list">
            {vlist.map((v) => (
              <Link key={v.id} className="aprow vnrow" href={`/vendors/v/${v.id}`}>
                <span className="ap-main">
                  <span className="ap-title">
                    {v.name}
                    {v.test && <span className="ap-ver sbx">Sandbox</span>}
                  </span>
                  <span className="ap-sub">
                    <span>{v.services.join(", ") || "No type set"}</span>
                    {v.areas && <span>{v.areas}</span>}
                  </span>
                </span>
                <span className="ap-prog small">{v.people ? `${v.people} ${v.people === 1 ? "person" : "people"}` : "Not joined yet"}</span>
                <span className="ap-prog small">
                  {v.asked} asked · {v.quoted} quoted · {v.won} won
                </span>
                <span className="ap-prog small">{v.replyHours != null ? `replies in ~${v.replyHours < 1 ? "under 1" : Math.round(v.replyHours)} h` : ""}</span>
                <span className="ap-end">
                  <span className={`ap-st ${v.status === "active" ? (v.people ? "signed" : "open") : "cancelled"}`}>{v.status === "active" ? (v.people ? "Active" : "Invited") : "Off"}</span>
                </span>
              </Link>
            ))}
            {!vlist.length && <p className="empty">{needle ? "Nothing matches that search." : "No vendors yet. Press Add vendor, then send them their join link."}</p>}
          </div>
        </section>
      )}
      {adding && <VendorForm onClose={() => setAdding(false)} />}
    </>
  );
}

// ------------------------------------------------------------------ one vendor: tools

export function VendorTools({ vendor, lead }: { vendor: { id: string; status: string } & VendorInput; lead: boolean }) {
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const { busy: b2, act } = useAct();
  const makeLink = () =>
    start(async () => {
      const r = await vendorInviteLink(vendor.id);
      if (!r.ok) return toast(r.error);
      setLink(r.link);
    });
  return (
    <div className="ap-tools">
      <button type="button" className="btn btn-primary" disabled={busy || vendor.status !== "active"} onClick={makeLink}>
        <Icon name="link" size={15} />
        Get join link
      </button>
      <button type="button" className="btn" onClick={() => setEditing(true)}>
        <Icon name="edit" size={15} />
        Edit
      </button>
      {lead && (
        <button type="button" className="btn btn-ghost" disabled={b2} onClick={() => act(() => setVendorStatus(vendor.id, vendor.status !== "active"), vendor.status === "active" ? "Access turned off." : "Access turned on.")}>
          {vendor.status === "active" ? "Turn off access" : "Turn access back on"}
        </button>
      )}
      {editing && <VendorForm vendor={vendor} onClose={() => setEditing(false)} />}
      {link && (
        <Dialog title="Join link for this vendor" onClose={() => setLink(null)} wide>
          <p className="hint">Send this to your contact (WhatsApp or email). Anyone at the vendor can use it to make their own login. It works for 14 days; making a new link turns the old one off.</p>
          <input className="inp" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Join link" />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={() => setLink(null)}>
              Close
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast("Link copied."))}>
              <Icon name="copy" size={15} />
              Copy link
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function PersonToggle({ id, on }: { id: string; on: boolean }) {
  const { busy, act } = useAct();
  return (
    <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => act(() => setVendorPerson(id, !on), on ? "Access turned off." : "Access turned on.")}>
      {on ? "Turn off" : "Turn on"}
    </button>
  );
}

/** Makes a one-time password reset link for a person at a vendor. */
export function VendorPersonReset({ id }: { id: string }) {
  const [link, setLink] = useState<{ link: string; name: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await vendorResetLink(id);
            if (!r.ok) return toast(r.error);
            setLink(r);
          })
        }
      >
        <Icon name="lock" size={13} />
        Reset password
      </button>
      {link && (
        <Dialog title={`Reset link for ${link.name}`} onClose={() => setLink(null)} wide>
          <p className="hint">Send this to them. It works once, for 24 hours, and signs them out everywhere else.</p>
          <input className="inp" readOnly value={link.link} onFocus={(e) => e.target.select()} aria-label="Reset link" />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={() => setLink(null)}>
              Close
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void navigator.clipboard?.writeText(link.link).then(() => toast("Link copied."))}>
              <Icon name="copy" size={15} />
              Copy link
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

// ------------------------------------------------------------------ one request

export type QuoteView = {
  vendor_id: string; vendor: string; state: QuoteState; price: string | null; currency: string | null; validUntil: string | null; readyOn: string | null; readyISO: string | null;
  note: string | null; declineReason: string | null; quotedAt: string | null; changes: number; unread: number; people: number;
  files: { id: string; name: string; size: string; view: boolean }[];
};
export type RfqView = {
  id: string; title: string; fields: Field[]; notes: string; status: RfqStatus; replyBy: string; awardedVendorId: string | null; awardByName: string | null; awardNote: string | null;
  canManage: boolean; lead: boolean; sandbox?: boolean; quotes: QuoteView[];
};

export function RfqBoard({ rfq, vendors, initialVendor, stepTemplates = [], today = "" }: { rfq: RfqView; vendors: VendorLite[]; initialVendor?: string; stepTemplates?: { id: string; name: string; steps: string[] }[]; today?: string }) {
  // In the sandbox the Admin can try everything; everywhere else the Admin is view only.
  const viewOnly = useViewOnly() && !rfq.sandbox;
  const router = useRouter();
  const { busy, act } = useAct();
  const [sel, setSel] = useState<string>(rfq.quotes.find((x) => x.vendor_id === initialVendor)?.vendor_id ?? rfq.awardedVendorId ?? rfq.quotes.find((x) => x.unread > 0)?.vendor_id ?? rfq.quotes[0]?.vendor_id ?? "");
  const [mode, setMode] = useState<null | "edit" | "add" | "all" | "award" | "back" | "cancel" | "ai">(null);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<QuoteView | null>(null);
  const [fields, setFields] = useState<Field[]>(rfq.fields);
  const [title, setTitle] = useState(rfq.title);
  const [notes, setNotes] = useState(rfq.notes);
  const [replyBy, setReplyBy] = useState(rfq.replyBy);
  const [picked, setPicked] = useState<string[]>([]);
  const [ai, setAi] = useState<string | null>(null);
  const [aiBusy, startAi] = useTransition();
  const [draft, setDraft] = useState("");
  const [steps, setSteps] = useState<string[]>(startSteps);
  const [due, setDue] = useState("");
  const close = () => (setMode(null), setText(""), setTarget(null));

  const open = rfq.status === "open";
  const can = rfq.canManage && !viewOnly;
  const quoted = rfq.quotes.filter((x) => x.state === "quoted");
  const oneCurrency = new Set(quoted.map((x) => x.currency)).size === 1;
  const cheapest = quoted.length > 1 && oneCurrency ? [...quoted].sort((a, b) => Number(a.price) - Number(b.price))[0].vendor_id : null;
  const dated = quoted.filter((x) => x.readyISO);
  const fastest = dated.length > 1 ? [...dated].sort((a, b) => a.readyISO!.localeCompare(b.readyISO!))[0].vendor_id : null;
  const chosen = rfq.quotes.find((x) => x.vendor_id === rfq.awardedVendorId) ?? null;
  const current = rfq.quotes.find((x) => x.vendor_id === sel) ?? null;
  const others = vendors.filter((v) => v.status === "active" && !rfq.quotes.some((x) => x.vendor_id === v.id));

  const runAi = (what: "compare" | "counter", vendorId?: string) =>
    startAi(async () => {
      const r = await askAboutQuotes(rfq.id, what, vendorId);
      if (!r.ok) return toast(r.error);
      if (what === "compare") (setAi(r.answer), setMode("ai"));
      else setDraft(r.answer);
    });

  return (
    <>
      {rfq.status === "pending_award" && chosen && (
        <div className="ap-decide rq-banner">
          <p className="ap-decide-t">
            <b>{rfq.awardByName ?? "A Member"} wants to award this to {chosen.vendor}</b> at {money(chosen.price, chosen.currency)}. {rfq.awardNote ? `Reason: ${rfq.awardNote}. ` : ""}
            {rfq.lead ? "It needs your approval." : "Waiting for a Lead to approve."}
          </p>
          {rfq.lead && !viewOnly && (
            <div className="ap-decide-b">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => decideAward(rfq.id, true, ""), `Awarded to ${chosen.vendor}.`)}>
                <Icon name="check" size={15} />
                Approve award
              </button>
              <button type="button" className="btn" onClick={() => setMode("back")}>
                Send back
              </button>
            </div>
          )}
        </div>
      )}
      {(rfq.status === "awarded" || rfq.status === "confirmed") && chosen && (
        <div className="ap-decide rq-banner ok">
          {can && rfq.status === "awarded" && (
            <div className="ap-decide-b" style={{ order: 2 }}>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Take the award back from ${chosen.vendor}? The request opens again so you can choose another quote.`)) act(() => withdrawAward(rfq.id, ""), "Award withdrawn. The request is open again.");
                }}
              >
                Withdraw award
              </button>
            </div>
          )}
          <p className="ap-decide-t">
            <b>Awarded to {chosen.vendor}</b> at {money(chosen.price, chosen.currency)}. {rfq.status === "awarded" ? "Waiting for them to confirm the job. Tracking starts then." : "They confirmed the job. Follow it in Job progress above."}
          </p>
        </div>
      )}

      {!viewOnly && (
        <div className="ap-tools no-print">
          {can && open && (
            <button type="button" className="btn" onClick={() => (setTitle(rfq.title), setFields(rfq.fields), setNotes(rfq.notes), setReplyBy(rfq.replyBy), setMode("edit"))}>
              <Icon name="edit" size={15} />
              Edit request
            </button>
          )}
          {can && open && others.length > 0 && (
            <button type="button" className="btn" onClick={() => (setPicked([]), setMode("add"))}>
              <Icon name="plus" size={15} />
              Add vendors
            </button>
          )}
          {open && rfq.quotes.length > 1 && (
            <button type="button" className="btn" onClick={() => setMode("all")}>
              <Icon name="chat" size={15} />
              Message all
            </button>
          )}
          {open && rfq.quotes.some((x) => x.state === "invited") && (
            <button type="button" className="btn" disabled={busy} onClick={() => act(() => remindVendors(rfq.id), "Reminder sent.")}>
              <Icon name="clock" size={15} />
              Remind
            </button>
          )}
          {quoted.length > 0 && (
            <button type="button" className="btn" disabled={aiBusy} onClick={() => runAi("compare")}>
              <Icon name="spark" size={15} />
              {aiBusy ? "Thinking…" : "Ask AI to compare"}
            </button>
          )}
          {can && rfq.status !== "done" && rfq.status !== "cancelled" && (
            <button type="button" className="btn btn-ghost" onClick={() => setMode("cancel")}>
              Cancel request
            </button>
          )}
        </div>
      )}

      <div className="rq-grid">
        <section className="panel" aria-label="Quotes">
          <div className="panel-h">
            <h2>
              Quotes <span className="count">{quoted.length} of {rfq.quotes.length}</span>
            </h2>
            <span className="small muted">Vendors never see each other&apos;s prices.</span>
          </div>
          <div className="rq-quotes">
            {rfq.quotes.map((x) => {
              const won = rfq.awardedVendorId === x.vendor_id && rfq.status !== "open";
              return (
                <div key={x.vendor_id} className={`rq-q ${x.state}${sel === x.vendor_id ? " sel" : ""}${won ? " won" : ""}`}>
                  <button type="button" className="rq-q-main" onClick={() => setSel(x.vendor_id)} aria-pressed={sel === x.vendor_id}>
                    <span className="rq-q-h">
                      <b>{x.vendor}</b>
                      {x.unread > 0 && <span className="nav-badge blue">{x.unread}</span>}
                      {won && <span className="ap-st signed">{rfq.status === "pending_award" ? "Chosen" : "Awarded"}</span>}
                      {cheapest === x.vendor_id && <span className="rq-tag">Cheapest</span>}
                      {fastest === x.vendor_id && <span className="rq-tag fast">Soonest</span>}
                    </span>
                    {x.state === "quoted" ? (
                      <>
                        <span className="rq-price">{money(x.price, x.currency)}</span>
                        <span className="rq-q-meta">
                          {x.readyOn && <span>Can do {x.readyOn}</span>}
                          {x.validUntil && <span>Price valid until {x.validUntil}</span>}
                          {x.changes > 0 && <span>Price changed {x.changes}×</span>}
                          {x.quotedAt && <span>Quoted {x.quotedAt}</span>}
                        </span>
                        {x.note && <span className="rq-q-note">{x.note}</span>}
                      </>
                    ) : x.state === "declined" ? (
                      <span className="rq-q-note">Can&apos;t do: {x.declineReason}</span>
                    ) : (
                      <span className="rq-q-note muted">{x.people ? "No reply yet" : "No reply yet · nobody from this vendor has joined the portal"}</span>
                    )}
                  </button>
                  {x.files.length > 0 && (
                    <div className="files">
                      {x.files.map((f) => (
                        <a key={f.id} className="file-chip" href={`/vendors/file/${f.id}${f.view ? "" : "?download"}`} target={f.view ? "_blank" : undefined} rel="noopener noreferrer">
                          <Icon name="file" size={14} />
                          <span className="file-n">{f.name}</span>
                          <span className="file-s">{f.size}</span>
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="rq-q-f">
                    <Link className="btn btn-sm btn-ghost" href={`/vendors/v/${x.vendor_id}`}>
                      Vendor page
                    </Link>
                    {can && x.state === "quoted" && (open || (rfq.status === "pending_award" && rfq.lead && !won)) && (
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => (setTarget(x), setMode("award"))}>
                        {rfq.lead ? "Award" : "Choose"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel rq-chat-p" aria-label="Chat">
          <div className="panel-h">
            <h2>Chat{current ? ` with ${current.vendor}` : ""}</h2>
            {current && current.state === "quoted" && open && !viewOnly && (
              <button type="button" className="btn btn-sm btn-ghost" disabled={aiBusy} onClick={() => runAi("counter", current.vendor_id)}>
                <Icon name="spark" size={14} />
                Draft a counter-offer
              </button>
            )}
          </div>
          {rfq.quotes.length > 1 && (
            <div className="chips rq-who" role="group" aria-label="Vendor">
              {rfq.quotes.map((x) => (
                <button key={x.vendor_id} type="button" className="chip all" aria-pressed={sel === x.vendor_id} onClick={() => setSel(x.vendor_id)}>
                  {x.vendor}
                  {x.unread > 0 && <span className="nav-badge blue">{x.unread}</span>}
                </button>
              ))}
            </div>
          )}
          {current ? (
            <RfqChat
              key={current.vendor_id}
              url={`/api/rfq/${rfq.id}/chat?vendor=${current.vendor_id}`}
              side="team"
              canWrite={!viewOnly}
              send={async (body) => {
                const r = await sendRfqMessage(rfq.id, current.vendor_id, body);
                if (r.ok) router.refresh();
                return r;
              }}
              draft={draft}
              onDraftUsed={() => setDraft("")}
              placeholder={`Message ${current.vendor}…`}
            />
          ) : (
            <p className="empty">No vendors on this request.</p>
          )}
        </section>
      </div>

      {mode === "edit" && (
        <Dialog title="Edit request" onClose={close} wide>
          <p className="hint">Vendors are told the details changed, so they can check their quote.</p>
          <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="Title" />
          <FieldBuilder fields={fields} setFields={setFields} />
          <textarea className="inp" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else" maxLength={5000} aria-label="Notes" />
          <div className="field ap-date">
            <label htmlFor="rq-eby">Reply by</label>
            <input id="rq-eby" type="date" className="inp inp-date" value={replyBy} onChange={(e) => setReplyBy(e.target.value)} />
          </div>
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!title.trim() || busy} onClick={() => act(() => updateRfq(rfq.id, { title, fields, notes, replyBy }), "Request updated.", close)}>
              Save changes
            </button>
          </div>
        </Dialog>
      )}
      {mode === "add" && (
        <Dialog title="Add vendors" onClose={close} wide>
          <VendorPicker vendors={others} picked={picked} setPicked={setPicked} />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!picked.length || busy} onClick={() => act(() => addRfqVendors(rfq.id, picked), "Request sent.", close)}>
              Send request
            </button>
          </div>
        </Dialog>
      )}
      {mode === "all" && (
        <Dialog title="Message all vendors" onClose={close}>
          <p className="hint">Each vendor gets this in their own chat. They don&apos;t see who else got it.</p>
          <textarea className="inp" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} autoFocus />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!text.trim() || busy} onClick={() => act(() => sendRfqMessage(rfq.id, "all", text), "Sent to all vendors.", close)}>
              Send to all
            </button>
          </div>
        </Dialog>
      )}
      {mode === "award" && target && (
        <Dialog title={rfq.lead ? `Award to ${target.vendor}?` : `Choose ${target.vendor}?`} onClose={close} wide>
          <p className="hint">
            {money(target.price, target.currency)}. {rfq.lead ? "The vendor is asked to confirm, and the others are told another quote was chosen." : "A Lead has to approve before the vendor is told."}
          </p>
          <textarea className="inp" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={rfq.lead ? "Note for the team (optional)" : "Why this vendor? (the Lead sees this)"} maxLength={500} />
          <div className="field">
            <label>Milestones to track the job</label>
            <MilestonePlanner steps={steps} setSteps={setSteps} templates={stepTemplates} />
          </div>
          <div className="field ap-date">
            <label htmlFor="rq-due">Job should be finished by (optional)</label>
            <input id="rq-due" type="date" className="inp inp-date" min={today || undefined} value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => pickWinner(rfq.id, target.vendor_id, text, { steps, due, seenPrice: target.price, seenCurrency: target.currency }), rfq.lead ? `Awarded to ${target.vendor}.` : "Sent to the Lead for approval.", close)}>
              {rfq.lead ? "Award" : "Send for approval"}
            </button>
          </div>
        </Dialog>
      )}
      {mode === "back" && (
        <Dialog title="Send the choice back" onClose={close}>
          <p className="hint">The request opens again so they can choose differently or negotiate more.</p>
          <textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Why?" maxLength={500} autoFocus />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!text.trim() || busy} onClick={() => act(() => decideAward(rfq.id, false, text), "Sent back.", close)}>
              Send back
            </button>
          </div>
        </Dialog>
      )}
      {mode === "cancel" && (
        <Dialog title="Cancel this request?" onClose={close}>
          <p className="hint">Every vendor is told no quote is needed. It stays in the list as Cancelled.</p>
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Keep it
            </button>
            <button type="button" className="btn ap-danger" disabled={busy} onClick={() => act(() => closeRfq(rfq.id, "cancelled"), "Request cancelled.", close)}>
              Cancel request
            </button>
          </div>
        </Dialog>
      )}
      {mode === "ai" && ai && (
        <Dialog title="AI comparison" onClose={close} wide>
          <p className="rq-ai">{ai}</p>
          <p className="hint">A suggestion only. The choice is yours.</p>
          <div className="form-f">
            <button type="button" className="btn btn-primary" onClick={close}>
              Close
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

export { QUOTE_STATE };
