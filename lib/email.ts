// Splits pasted email text into its header lines and body. Pure; safe on server and client.

export type SplitEmail = { from: string; to: string; subject: string; sent: string; body: string };

/** Longest email or thread the app reads in one go (about 60,000 words). */
export const MAX_EMAIL_CHARS = 300_000;

export function splitEmail(raw: string): SplitEmail {
  const lines = raw.replace(/\r\n?/g, "\n").replace(/ /g, " ").split("\n");
  const h: Record<string, string> = {};
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  // Emails printed to PDF from Outlook start with the account name above the headers. Skip up to two
  // short name-like lines when a "From:" line follows straight after.
  for (let k = i, seen = 0; k < lines.length && seen <= 2; k++) {
    const l = lines[k].trim();
    if (!l) continue;
    if (/^from\s*:/i.test(l)) {
      if (seen) i = k;
      break;
    }
    if (l.length > 60 || /[.,:;!?]$/.test(l)) break;
    seen++;
  }
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^(from|to|cc|subject|date|sent)\s*:\s*(.*)$/i);
    if (!m) break;
    h[m[1].toLowerCase()] = m[2].trim();
  }
  const body = lines.slice(i).join("\n").replace(/^\n+/, "").trimEnd();
  return { from: h.from ?? "", to: h.to ?? "", subject: (h.subject ?? "").replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "").trim(), sent: h.date ?? h.sent ?? "", body };
}

export function parseAddress(v: string): { name: string; email: string } {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  if (v.includes("@")) return { name: "", email: v.trim() };
  return { name: v.trim(), email: "" };
}
