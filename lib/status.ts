import type { Role } from "@/lib/auth";

export const STATUSES = ["todo", "progress", "wait", "done", "approved"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  todo: "To do",
  progress: "In progress",
  wait: "Waiting",
  done: "Done",
  approved: "Approved",
};

export const PRIORITIES = ["low", "normal", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", normal: "Normal", high: "High" };

export const isStatus = (v: unknown): v is Status => typeof v === "string" && (STATUSES as readonly string[]).includes(v);
export const isPriority = (v: unknown): v is Priority => typeof v === "string" && (PRIORITIES as readonly string[]).includes(v);
export const closedStatus = (s: string) => s === "done" || s === "approved";

/** Why this role can't move a point from `from` to `to`, or null when it can. */
export function statusBlocked(role: Role, from: Status, to: Status): string | null {
  if (role === "lead") return null;
  if (to === "approved") return "Only the Lead can approve. Mark it done and the Lead will review it.";
  if (from === "approved") return "This point is approved. Ask the Lead to reopen it if something changed.";
  return null;
}

export function caseRef(id: string | number): string {
  return `AE-${String(id).padStart(4, "0")}`;
}
