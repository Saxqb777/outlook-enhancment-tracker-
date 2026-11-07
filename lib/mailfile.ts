// Reads email files in the browser: .eml (MIME) and .msg (Outlook). Only text is kept; attachments are ignored.

type Headers = Record<string, string>;

function hdrs(head: string): Headers {
  const h: Headers = {};
  head
    .replace(/\n[ \t]+/g, " ")
    .split("\n")
    .forEach((l) => {
      const i = l.indexOf(":");
      if (i > 0) {
        const k = l.slice(0, i).trim().toLowerCase();
        if (!(k in h)) h[k] = l.slice(i + 1).trim();
      }
    });
  return h;
}

function bytesDecode(bin: string, charset: string): string {
  try {
    return new TextDecoder(charset || "utf-8").decode(Uint8Array.from(bin, (c) => c.charCodeAt(0) & 255));
  } catch {
    return bin;
  }
}

function decodeBody(b: string, h: Headers): string {
  const enc = (h["content-transfer-encoding"] || "").toLowerCase();
  const cs = ((h["content-type"] || "").match(/charset="?([^";\s]+)/i) || [])[1] || "utf-8";
  if (enc === "base64") {
    try {
      return bytesDecode(atob(b.replace(/\s+/g, "")), cs);
    } catch {
      return b;
    }
  }
  if (enc === "quoted-printable") {
    return bytesDecode(b.replace(/=\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, x) => String.fromCharCode(parseInt(x, 16))), cs);
  }
  return b;
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n\n"),
    "text/html",
  );
  return (doc.body?.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

function partText(h: Headers, body: string): string {
  const ct = h["content-type"] || "text/plain";
  const bm = ct.match(/boundary="?([^";]+)"?/i);
  if (/multipart\//i.test(ct) && bm) {
    let html: string | null = null;
    for (const part of body.split("--" + bm[1]).slice(1)) {
      if (part.startsWith("--")) break;
      const s = part.replace(/^\n/, "");
      const k = s.indexOf("\n\n");
      const ph = hdrs(k < 0 ? s : s.slice(0, k));
      const pb = k < 0 ? "" : s.slice(k + 2);
      const pct = ph["content-type"] || "text/plain";
      if (/multipart\//i.test(pct)) {
        const r = partText(ph, pb);
        if (r) return r;
      } else if (/text\/plain/i.test(pct) && !/attachment/i.test(ph["content-disposition"] || "")) {
        return decodeBody(pb, ph);
      } else if (/text\/html/i.test(pct) && html === null) {
        html = decodeBody(pb, ph);
      }
    }
    return html ? stripHtml(html) : "";
  }
  const t = decodeBody(body, h);
  return /text\/html/i.test(ct) ? stripHtml(t) : t;
}

function words2047(s: string): string {
  return s.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_, cs: string, enc: string, txt: string) => {
    try {
      return bytesDecode(
        enc.toLowerCase() === "b" ? atob(txt) : txt.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (__, x) => String.fromCharCode(parseInt(x, 16))),
        cs,
      );
    } catch {
      return txt;
    }
  });
}

export function decodeEml(src: string): string {
  src = src.replace(/\r\n?/g, "\n");
  const k = src.indexOf("\n\n");
  const h = hdrs(k < 0 ? src : src.slice(0, k));
  const body = k < 0 ? "" : src.slice(k + 2);
  const head = ["from", "to", "subject", "date"]
    .filter((x) => h[x])
    .map((x) => `${x[0].toUpperCase() + x.slice(1)}: ${words2047(h[x])}`)
    .join("\n");
  return `${head}\n\n${partText(h, body).trim()}`.trim();
}

/** Outlook .msg files are binary; this pulls out the longest readable text run, which is almost always the body. */
export function readMsg(buf: ArrayBuffer): string {
  const u16 = new TextDecoder("utf-16le").decode(buf);
  let runs = (u16.match(/[\x20-\x7E -ɏ‘-”–—\r\n\t]{30,}/g) || []).map((s) => s.trim()).filter(Boolean);
  runs.sort((a, b) => b.length - a.length);
  if (runs.length) return runs[0];
  const a8 = new TextDecoder("windows-1252").decode(buf);
  runs = (a8.match(/[\x20-\x7E\r\n\t]{40,}/g) || []).sort((a, b) => b.length - a.length);
  return (runs[0] || "").trim();
}

export async function readEmailFile(file: File): Promise<{ text: string; note: string } | { error: string }> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (file.size > 5_000_000) return { error: "That file is over 5 MB. Paste the email text instead." };
  try {
    if (ext === "msg") {
      const text = readMsg(await file.arrayBuffer());
      return text ? { text, note: "Outlook file. Check the text below looks right." } : { error: "That file has no readable text. Paste the email instead." };
    }
    const raw = await file.text();
    const looksMime = /^(received|return-path|mime-version|message-id|from|to|subject|date):/im.test(raw.slice(0, 3000)) && /content-type:/i.test(raw);
    const text = ext === "eml" || looksMime ? decodeEml(raw) : raw.trim();
    return text ? { text, note: "Ready to read" } : { error: "That file has no readable text. Paste the email instead." };
  } catch {
    return { error: "That file couldn't be read. Save it as .eml, or paste the text." };
  }
}
