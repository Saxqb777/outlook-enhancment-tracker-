// Labels shared by the server pages and the client components.
export type State = "pending" | "signed" | "sent_back" | "rejected";
export type Status = "open" | "signed" | "rejected" | "cancelled";

export const STATE_LABEL: Record<State, string> = { pending: "Waiting", signed: "Signed", sent_back: "Sent back", rejected: "Rejected" };
export const STATUS_LABEL: Record<Status, string> = { open: "Waiting", signed: "Signed", rejected: "Rejected", cancelled: "Cancelled" };

/** "2 signed · 1 sent back · 1 waiting" */
export function progress(signers: { state: State }[]) {
  const n = (s: State) => signers.filter((x) => x.state === s).length;
  return [n("signed") && `${n("signed")} signed`, n("sent_back") && `${n("sent_back")} sent back`, n("rejected") && `${n("rejected")} rejected`, n("pending") && `${n("pending")} waiting`].filter(Boolean).join(" · ");
}
