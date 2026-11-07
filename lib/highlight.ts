// Finds each point's source sentence inside the email body so it can be highlighted.
// Matching ignores differences in spacing, line breaks and curly quotes.

export type Segment = { text: string; n?: number };

function norm(c: string): string {
  if (c === "‘" || c === "’") return "'";
  if (c === "“" || c === "”") return '"';
  if (c === "–" || c === "—") return "-";
  return c.toLowerCase();
}

function normalized(text: string): { s: string; map: number[] } {
  let s = "";
  const map: number[] = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) {
      if (!space && s.length) {
        s += " ";
        map.push(i);
      }
      space = true;
      continue;
    }
    space = false;
    s += norm(c);
    map.push(i);
  }
  return { s, map };
}

/** quotes[i] belongs to point number i + 1. Unmatched quotes are skipped. */
export function segmentBody(body: string, quotes: (string | null | undefined)[]): { segments: Segment[]; matched: Set<number> } {
  const { s, map } = normalized(body);
  const ranges: { start: number; end: number; n: number }[] = [];
  quotes.forEach((q, i) => {
    const qn = normalized((q ?? "").trim()).s.trim();
    if (qn.length < 8) return;
    let from = 0;
    while (from <= s.length) {
      const at = s.indexOf(qn, from);
      if (at < 0) return;
      const start = map[at];
      const end = map[at + qn.length - 1] + 1;
      if (!ranges.some((r) => start < r.end && end > r.start)) {
        ranges.push({ start, end, n: i + 1 });
        return;
      }
      from = at + 1;
    }
  });
  ranges.sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start > pos) segments.push({ text: body.slice(pos, r.start) });
    segments.push({ text: body.slice(r.start, r.end), n: r.n });
    pos = r.end;
  }
  if (pos < body.length) segments.push({ text: body.slice(pos) });
  return { segments, matched: new Set(ranges.map((r) => r.n)) };
}
