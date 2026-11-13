"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { editPointText, removeAttachment, removePoint, setArchived } from "@/app/actions/manage";
import { Dialog, useAct } from "@/components/Approvals";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/work";

/** Leads only: correct a point's wording, or remove a point that shouldn't be there. */
export function PointFix({ pointId, text }: { pointId: string; text: string }) {
  const [mode, setMode] = useState<null | "edit" | "remove">(null);
  const [value, setValue] = useState(text);
  const [why, setWhy] = useState("");
  const { busy, act } = useAct();
  const close = () => (setMode(null), setWhy(""));
  return (
    <div className="pt-fix">
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => (setValue(text), setMode("edit"))}>
        <Icon name="edit" size={13} />
        Edit wording
      </button>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMode("remove")}>
        <Icon name="x" size={13} />
        Remove point
      </button>
      {mode === "edit" && (
        <Dialog title="Edit the point's wording" onClose={close}>
          <p className="hint">The old wording stays in the point's history.</p>
          <textarea className="inp" rows={3} value={value} onChange={(e) => setValue(e.target.value)} maxLength={300} autoFocus />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!value.trim() || value.trim() === text || busy} onClick={() => act(() => editPointText(pointId, value), "Wording updated.", close)}>
              Save
            </button>
          </div>
        </Dialog>
      )}
      {mode === "remove" && (
        <Dialog title="Remove this point?" onClose={close}>
          <p className="hint">The point, its updates and its files are removed for good. A line saying who removed it stays in the case chat.</p>
          <input className="inp" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why? e.g. the AI read it wrong (optional)" maxLength={300} />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Keep it
            </button>
            <button type="button" className="btn ap-danger" disabled={busy} onClick={() => act(() => removePoint(pointId, why), "Point removed.", close)}>
              Remove point
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** Leads only: asks, then removes a file that was attached by mistake. */
export function askRemoveFile(f: { id: string; name: string }) {
  if (!window.confirm(`Remove "${f.name}" for good? A line saying it was removed stays in the history.`)) return;
  void removeAttachment(f.id).then((r) => {
    if (!r.ok) return toast(r.error);
    toast("File removed.");
    window.location.reload();
  });
}

/** Leads only: hide a case from the lists without deleting it, or bring it back. */
export function ArchiveButton({ caseId, archived }: { caseId: string; archived: boolean }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const { busy, act } = useAct();
  return (
    <>
      <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => (archived ? act(() => setArchived(caseId, false), "Case is back in the lists.", () => router.refresh()) : setAsk(true))}>
        <span className="m-hide">{archived ? "Bring back" : "Archive"}</span>
        <span className="m-only-i">{archived ? "Restore" : "Archive"}</span>
      </button>
      {ask && (
        <Dialog title="Archive this case?" onClose={() => setAsk(false)}>
          <p className="hint">It disappears from Home, Cases, Board and the Dashboard. Nothing is deleted, and you can bring it back from Cases, Archived.</p>
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={() => setAsk(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => setArchived(caseId, true), "Case archived.", () => setAsk(false))}>
              Archive
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
