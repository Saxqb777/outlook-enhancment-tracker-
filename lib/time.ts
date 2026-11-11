// Dates are plain "YYYY-MM-DD" strings, read in the team's time zone (UAE).
export const TZ = process.env.NEXT_PUBLIC_APP_TZ || "Asia/Dubai";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y, m, d];
}

export function isISODate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = parts(v);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 864e5);
}

export function weekday(iso: string): number {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function fmtDay(iso: string): string {
  const [, m, d] = parts(iso);
  return `${WD[weekday(iso)]} ${d} ${MO[m - 1]}`;
}

export function fmtShort(iso: string): string {
  const [, m, d] = parts(iso);
  return `${d} ${MO[m - 1]}`;
}

export function fmtLongToday(today: string): string {
  const [, m, d] = parts(today);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${days[weekday(today)]} ${d} ${months[m - 1]}`;
}

/** Next given weekday (0 = Sunday), strictly after today unless includeToday. */
export function nextWeekday(today: string, dow: number, includeToday = false): string {
  let n = (dow - weekday(today) + 7) % 7;
  if (n === 0 && !includeToday) n = 7;
  return addDaysISO(today, n);
}

export type DueInfo = { cls: "" | "soon" | "late" | "none"; text: string; title?: string };

export function dueInfo(due: string | null, status: string, today: string): DueInfo {
  if (!due) return { cls: "none", text: "No deadline" };
  const n = diffDays(due, today);
  const closed = status === "done" || status === "approved";
  if (!closed && n < 0) return { cls: "late", text: `${fmtDay(due)} · ${-n} day${n === -1 ? "" : "s"} late`, title: `Was due ${fmtDay(due)}` };
  if (n === 0) return { cls: closed ? "" : "soon", text: `${fmtDay(due)} · today` };
  if (n === 1) return { cls: closed ? "" : "soon", text: `${fmtDay(due)} · tomorrow` };
  return { cls: !closed && n <= 2 ? "soon" : "", text: fmtDay(due) };
}

/** "Today, 09:05" / "Yesterday, 16:20" / "5 Nov, 09:05" in the team's time zone. */
export function fmtWhen(ts: string | Date, today: string): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const day = todayISO(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const n = diffDays(day, today);
  if (n === 0) return `Today, ${time}`;
  if (n === -1) return `Yesterday, ${time}`;
  return `${fmtShort(day)}, ${time}`;
}
