"use client";

import { useState } from "react";
import { commentStep, flagStep, resolveStep, tickStep, untickStep } from "@/app/actions/portal";
import { addJobStep, closeRfq, commentJobStep, flagJobStep, removeJobStep, resolveJobStep, saveStepTemplate, tickJobStep, untickJobStep } from "@/app/actions/vendors";
import { Dialog, useAct } from "@/components/Approvals";
import { AttachPicker, useAttach } from "@/components/Attach";
import { Icon } from "@/components/Icon";
import { DEFAULT_MILESTONES, POD, SUGGESTED_MILESTONES } from "@/lib/vendor-labels";

export type StepView = {
  id: string; title: string; needsPod: boolean; doneAt: string | null; doneBy: string | null; doneNote: string | null; problem: string | null; problemEta: string | null;
  files: { id: string; name: string; size: string; view: boolean }[];
  comments: { id: string; who: string; side: "team" | "vendor"; body: string; at: string }[];
};
type StepTemplate = { id: string; name: string; steps: string[] };

// ------------------------------------------------------------------ choosing the milestones (when awarding)

/** The list of milestones for a job: suggested ones, your own, saved lists. Proof of delivery is always last. */
export function MilestonePlanner({ steps, setSteps, templates }: { steps: string[]; setSteps: (s: string[]) => void; templates: StepTemplate[] }) {
  const [own, setOwn] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const { busy, act } = useAct();
  const has = (t: string) => steps.some((s) => s.toLowerCase() === t.toLowerCase());
  const add = (t: string) => {
    const v = t.trim().replace(/\s+/g, " ").slice(0, 80);
    if (v && !has(v) && v.toLowerCase() !== POD.toLowerCase()) setSteps([...steps, v]);
  };
  const move = (i: number, d: number) => {
    const n = [...steps];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    setSteps(n);
  };
  return (
    <div className="fb">
      {templates.length > 0 && (
        <div className="fb-tpl">
          <span className="hint">Saved lists:</span>
          {templates.map((t) => (
            <button key={t.id} type="button" className="chip" onClick={() => setSteps(t.steps)}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      <ol className="mp-list">
        {steps.map((s, i) => (
          <li key={s}>
            <span className="mp-n">{i + 1}</span>
            <span className="mp-t">{s}</span>
            <button type="button" className="icon-btn sm" aria-label={`Move ${s} up`} disabled={i === 0} onClick={() => move(i, -1)}>
              <Icon name="chevD" size={13} className="flip" />
            </button>
            <button type="button" className="icon-btn sm" aria-label={`Move ${s} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
              <Icon name="chevD" size={13} />
            </button>
            <button type="button" className="icon-btn sm" aria-label={`Remove ${s}`} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
              <Icon name="x" size={13} />
            </button>
          </li>
        ))}
        <li className="mp-pod">
          <span className="mp-n">{steps.length + 1}</span>
          <span className="mp-t">{POD}</span>
          <span className="hint">always last, needs a file</span>
        </li>
      </ol>
      <div className="fb-add">
        <span className="hint">Add:</span>
        {SUGGESTED_MILESTONES.filter((s) => !has(s)).map((s) => (
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
          placeholder="Your own milestone, e.g. Gate pass issued"
          maxLength={80}
          aria-label="Your own milestone"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(own);
              setOwn("");
            }
          }}
        />
        <button type="button" className="btn btn-sm" disabled={!own.trim()} onClick={() => (add(own), setOwn(""))}>
          Add
        </button>
        {saving ? (
          <>
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name for this list" maxLength={60} aria-label="Name for this list" />
            <button type="button" className="btn btn-sm btn-primary" disabled={!name.trim() || !steps.length || busy} onClick={() => act(() => saveStepTemplate(name, steps), "List saved.", () => setSaving(false))}>
              Save
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-sm btn-ghost" disabled={!steps.length} onClick={() => setSaving(true)}>
            Save this list
          </button>
        )}
      </div>
    </div>
  );
}
export const startSteps = () => [...DEFAULT_MILESTONES];

// ------------------------------------------------------------------ the job tracker

/**
 * The milestones of a running job. Both the team and the vendor can tick, comment and flag;
 * only the team can add or remove milestones and close the job.
 */
export function JobBoard({
  rfqId, steps, side, canAct, canEdit, running, closed, due, late, attachKey, closing,
}: {
  rfqId: string; steps: StepView[]; side: "team" | "vendor"; canAct: boolean; canEdit: boolean; running: boolean; closed: boolean; due: string | null; late: boolean; attachKey: "apv" | "vq";
  closing?: { rating: number | null; finalCost: string | null; note: string | null; currency: string };
}) {
  const A = side === "team" ? { tick: tickJobStep, untick: untickJobStep, comment: commentJobStep, flag: flagJobStep, resolve: resolveJobStep } : { tick: tickStep, untick: untickStep, comment: commentStep, flag: flagStep, resolve: resolveStep };
  const { busy, act } = useAct();
  const att = useAttach(attachKey);
  const [mode, setMode] = useState<null | { kind: "tick" | "flag" | "close"; step?: StepView }>(null);
  const [open, setOpen] = useState<string | null>(steps.find((s) => s.problem)?.id ?? null);
  const [text, setText] = useState("");
  const [eta, setEta] = useState("");
  const [comment, setComment] = useState("");
  const [add, setAdd] = useState("");
  const [rating, setRating] = useState(0);
  const [cost, setCost] = useState("");
  const close = () => (setMode(null), setText(""), setEta(""), att.clear());
  const done = steps.filter((s) => s.doneAt).length;
  // Milestones go in order: only the first open one can be ticked, and only the last ticked one can be undone.
  const next = steps.find((s) => !s.doneAt);
  const lastDone = [...steps].reverse().find((s) => s.doneAt);
  const pod = steps.find((s) => s.needsPod);
  const podDone = !pod || !!pod.doneAt;
  const live = canAct && running;

  return (
    <section className="panel job" aria-label="Job progress">
      <div className="panel-h">
        <h2>
          Job progress <span className="count">{done} of {steps.length}</span>
        </h2>
        <span className={`small ${late ? "ap-late" : "muted"}`}>{due && !closed ? `${late ? "Late · was due" : "Should be finished by"} ${due}` : ""}</span>
      </div>
      <div className="job-bar" aria-hidden="true">
        {steps.map((s) => (
          <i key={s.id} className={s.doneAt ? "on" : s.problem ? "bad" : ""} />
        ))}
      </div>
      {!running && !closed && <p className="hint job-wait">{side === "vendor" ? "Confirm the job above to start ticking milestones." : "Tracking starts when the vendor confirms the job."}</p>}
      <ol className="job-steps">
        {steps.map((s, i) => {
          const isOpen = open === s.id;
          return (
            <li key={s.id} className={`job-step${s.doneAt ? " done" : ""}${s.problem ? " bad" : ""}${next?.id === s.id && running ? " next" : ""}`}>
              <span className="job-dot">{s.doneAt ? <Icon name="check" size={14} /> : s.problem ? "!" : i + 1}</span>
              <div className="job-b">
                <div className="job-h">
                  <b>{s.title}</b>
                  {s.needsPod && !s.doneAt && <span className="rq-tag fast">Needs a file</span>}
                  <span className="sp" />
                  {live && next?.id === s.id && (
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => setMode({ kind: "tick", step: s })}>
                      <Icon name="check" size={14} />
                      Mark done
                    </button>
                  )}
                  {live && !s.doneAt && next?.id !== s.id && <span className="job-lock">After &ldquo;{next?.title}&rdquo;</span>}
                  <button type="button" className="btn btn-sm btn-ghost job-more" aria-expanded={isOpen} aria-label={`Comments and more for ${s.title}`} onClick={() => (setOpen(isOpen ? null : s.id), setComment(""))}>
                    <Icon name="chat" size={14} />
                    {s.comments.length || ""}
                  </button>
                </div>
                {s.doneAt && (
                  <p className="job-meta">
                    Done {s.doneAt}
                    {s.doneBy ? ` by ${s.doneBy}` : ""}
                    {s.doneNote ? ` · ${s.doneNote}` : ""}
                  </p>
                )}
                {s.problem && (
                  <p className="job-problem">
                    <b>Problem:</b> {s.problem}
                    {s.problemEta ? ` · new expected date ${s.problemEta}` : ""}
                    {live && (
                      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => act(() => A.resolve(s.id), "Marked as solved.")}>
                        Solved
                      </button>
                    )}
                  </p>
                )}
                {s.files.length > 0 && (
                  <div className="files">
                    {s.files.map((f) => (
                      <a key={f.id} className="file-chip" href={`/vendors/file/${f.id}${f.view ? "" : "?download"}`} target={f.view ? "_blank" : undefined} rel="noopener noreferrer">
                        <Icon name="file" size={14} />
                        <span className="file-n">{f.name}</span>
                        <span className="file-s">{f.size}</span>
                      </a>
                    ))}
                  </div>
                )}
                {isOpen && (
                  <div className="job-open">
                    {s.comments.map((c) => (
                      <p key={c.id} className={`job-c${c.side === side ? " me" : ""}`}>
                        <span>
                          {c.who} · {c.at}
                        </span>
                        {c.body}
                      </p>
                    ))}
                    {!s.comments.length && <p className="hint">No comments on this milestone yet.</p>}
                    {canAct && (
                      <form
                        className="job-cf"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (comment.trim()) act(() => A.comment(s.id, comment), "Comment added.", () => setComment(""));
                        }}
                      >
                        <input className="inp" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment or feedback on this milestone" maxLength={1000} aria-label="Comment" />
                        <button type="submit" className="btn btn-sm btn-primary" disabled={!comment.trim() || busy}>
                          Add
                        </button>
                      </form>
                    )}
                    {live && (
                      <div className="job-acts">
                        {!s.doneAt && !s.problem && (
                          <button type="button" className="btn btn-sm btn-ghost ap-no" onClick={() => setMode({ kind: "flag", step: s })}>
                            Report a problem
                          </button>
                        )}
                        {s.doneAt && lastDone?.id === s.id && (
                          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => act(() => A.untick(s.id), "Undone.")}>
                            <Icon name="undo" size={13} />
                            Undo done
                          </button>
                        )}
                        {canEdit && !s.doneAt && !s.needsPod && (
                          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => act(() => removeJobStep(s.id), "Milestone removed.")}>
                            Remove milestone
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {canEdit && canAct && !closed && (
        <form
          className="job-add no-print"
          onSubmit={(e) => {
            e.preventDefault();
            if (add.trim()) act(() => addJobStep(rfqId, add), "Milestone added.", () => setAdd(""));
          }}
        >
          <input className="inp" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add a milestone" maxLength={80} aria-label="Add a milestone" list="job-sug" />
          <datalist id="job-sug">
            {SUGGESTED_MILESTONES.filter((x) => !steps.some((s) => s.title.toLowerCase() === x.toLowerCase())).map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
          <button type="submit" className="btn btn-sm" disabled={!add.trim() || busy}>
            Add milestone
          </button>
          <span className="sp" />
          {running && (
            <button type="button" className="btn btn-primary" disabled={!podDone} title={podDone ? undefined : "Proof of delivery is needed first"} onClick={() => setMode({ kind: "close" })}>
              <Icon name="check" size={15} />
              Close job
            </button>
          )}
        </form>
      )}
      {canEdit && running && !podDone && <p className="hint job-wait">The job can be closed once Proof of delivery is uploaded.</p>}
      {closed && closing && (
        <p className="job-closed">
          <b>Job closed.</b>
          {closing.rating ? ` Rating: ${"★".repeat(closing.rating)}${"☆".repeat(5 - closing.rating)}.` : ""}
          {side === "team" && closing.finalCost ? ` Final cost: ${closing.currency} ${Number(closing.finalCost).toLocaleString("en-US")}.` : ""}
          {side === "team" && closing.note ? ` ${closing.note}` : ""}
        </p>
      )}

      {mode?.kind === "tick" && mode.step && (
        <Dialog title={`Mark "${mode.step.title}" as done`} onClose={close}>
          {mode.step.needsPod && <p className="hint">Attach the signed delivery note or a photo of it. The job can&apos;t be closed without it.</p>}
          <textarea className="inp" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode.step.title.toLowerCase().includes("driver") ? "Driver name, phone and truck number" : "Note (optional)"} maxLength={500} />
          <AttachPicker att={att} />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || att.busy || (mode.step.needsPod && !att.uploaded.length && !mode.step.files.length)}
              onClick={() => act(() => A.tick(mode.step!.id, text, att.uploaded), "Marked as done.", close)}
            >
              {att.busy ? "Uploading…" : "Mark done"}
            </button>
          </div>
        </Dialog>
      )}
      {mode?.kind === "flag" && mode.step && (
        <Dialog title={`Problem at "${mode.step.title}"`} onClose={close}>
          <p className="hint">{side === "vendor" ? "Agthia sees this straight away." : "The vendor sees this straight away."}</p>
          <textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened? e.g. truck broke down near Al Ain" maxLength={500} autoFocus />
          <div className="field ap-date">
            <label htmlFor="job-eta">New expected date (optional)</label>
            <input id="job-eta" type="date" className="inp inp-date" value={eta} onChange={(e) => setEta(e.target.value)} />
          </div>
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn ap-danger" disabled={!text.trim() || busy} onClick={() => act(() => A.flag(mode.step!.id, text, eta), "Problem reported.", close)}>
              Report problem
            </button>
          </div>
        </Dialog>
      )}
      {mode?.kind === "close" && (
        <Dialog title="Close this job" onClose={close}>
          {steps.some((s) => !s.doneAt) ? (
            <p className="job-problem">
              <b>Not ticked yet:</b> {steps.filter((s) => !s.doneAt).map((s) => s.title).join(", ")}. Closing anyway leaves {steps.filter((s) => !s.doneAt).length === 1 ? "it" : "them"} marked as not done.
            </p>
          ) : (
            <p className="hint">All milestones are done and the proof of delivery is in.</p>
          )}
          <p className="hint">Rating and final cost are optional. Only the team sees them.</p>
          <div className="job-stars" role="group" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-label={`${n} star${n === 1 ? "" : "s"}`} aria-pressed={rating >= n} onClick={() => setRating(rating === n ? 0 : n)}>
                {rating >= n ? "★" : "☆"}
              </button>
            ))}
            <span className="hint">{rating ? `${rating} of 5` : "No rating"}</span>
          </div>
          <input className="inp" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={`Final cost in ${closing?.currency ?? "AED"}, if it changed (optional)`} autoComplete="off" />
          <textarea className="inp" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Note for the team (optional)" maxLength={500} />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => closeRfq(rfqId, "done", { rating: rating || undefined, finalCost: cost, note: text }), "Job closed.", close)}>
              {steps.some((s) => !s.doneAt) ? "Close anyway" : "Close job"}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
