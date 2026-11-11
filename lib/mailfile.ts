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

/** Rough fallback for .msg files the proper reader can't open: the longest readable text run. */
function roughMsg(buf: ArrayBuffer): string {
  const u16 = new TextDecoder("utf-16le").decode(buf);
  let runs = (u16.match(/[\x20-\x7E\u00A0-\u024F\u2018-\u201D\u2013\u2014\r\n\t]{30,}/g) || []).map((s) => s.trim()).filter(Boolean);
  runs.sort((a, b) => b.length - a.length);
  if (runs.length) return runs[0];
  const a8 = new TextDecoder("windows-1252").decode(buf);
  runs = (a8.match(/[\x20-\x7E\r\n\t]{40,}/g) || []).sort((a, b) => b.length - a.length);
  return (runs[0] || "").trim();
}

/** Outlook .msg: sender, recipients, subject, date and body, read from the file's own fields. */
export async function readMsg(buf: ArrayBuffer): Promise<string> {
  try {
    const { default: MsgReader } = await import("@kenjiuno/msgreader");
    const d = new MsgReader(buf).getFileData();
    const body = (d.body ?? "").replace(/\r\n?/g, "\n").trim();
    if (!body) return roughMsg(buf);
    const from = [d.senderName, d.senderSmtpAddress || (d.senderEmail?.includes("@") ? d.senderEmail : "")].filter(Boolean);
    const to = (d.recipients ?? [])
      .map((r) => [r.name, r.smtpAddress || (r.email?.includes("@") ? r.email : "")].filter(Boolean))
      .map((r) => (r.length === 2 ? `${r[0]} <${r[1]}>` : r[0]))
      .filter(Boolean)
      .slice(0, 12)
      .join("; ");
    const when = d.clientSubmitTime || d.messageDeliveryTime;
    const head = [
      from.length ? `From: ${from.length === 2 ? `${from[0]} <${from[1]}>` : from[0]}` : "",
      when ? `Sent: ${new Date(when).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : "",
      to ? `To: ${to}` : "",
      d.subject ? `Subject: ${d.subject}` : "",
    ].filter(Boolean);
    return `${head.join("\n")}\n\n${body}`.trim();
  } catch {
    return roughMsg(buf);
  }
}

/** Pulls the text out of a PDF (e.g. an email or thread printed to PDF). Scanned pages have no text and come back empty. */
async function readPdf(buf: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const doc = await task.promise;
  const out: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let t = "";
      for (const item of content.items) {
        if ("str" in item) {
          t += item.str;
          if (item.hasEOL) t += "\n";
        }
      }
      out.push(t);
      page.cleanup();
    }
  } finally {
    void task.destroy();
  }
  const text = out
    .join("\n\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, pages: out.length };
}

/** True when text is mostly unreadable bytes (a binary file opened as text). */
function looksBinary(s: string): boolean {
  const sample = s.slice(0, 20000);
  if (!sample) return false;
  let bad = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 0xfffd || (c < 32 && c !== 9 && c !== 10 && c !== 13)) bad++;
  }
  return bad / sample.length > 0.02;
}

const SUPPORTED = "Use an .eml, .msg, .pdf or .txt file, or paste the text.";

export async function readEmailFile(file: File): Promise<{ text: string; note: string } | { error: string }> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  try {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const isPdf = ext === "pdf" || (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46); // %PDF
    if (isPdf) {
      if (file.size > 25_000_000) return { error: "That PDF is over 25 MB. Save just the email as PDF, or paste the text." };
      const { text, pages } = await readPdf(await file.arrayBuffer());
      if (text.replace(/\s+/g, "").length < 40) {
        return { error: "This PDF is a picture of the email, so there's no text to read. Open it, copy the text and paste it instead." };
      }
      return { text, note: `PDF, ${pages} page${pages === 1 ? "" : "s"}. Check the text below looks right.` };
    }
    if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "png", "jpg", "jpeg", "gif", "heic", "webp", "zip", "rar", "7z"].includes(ext)) {
      return { error: `Can't read .${ext} files here. ${SUPPORTED}` };
    }
    if (file.size > 5_000_000) return { error: "That file is over 5 MB. Paste the email text instead." };
    if (ext === "msg") {
      const text = await readMsg(await file.arrayBuffer());
      return text ? { text, note: "Outlook email. Sender, date and subject were read from the file." } : { error: "That file has no readable text. Paste the email instead." };
    }
    const raw = await file.text();
    if (looksBinary(raw)) return { error: `That file isn't an email this page can read. ${SUPPORTED}` };
    const looksMime = /^(received|return-path|mime-version|message-id|from|to|subject|date):/im.test(raw.slice(0, 3000)) && /content-type:/i.test(raw);
    const isHtml = ext === "htm" || ext === "html";
    const text = ext === "eml" || looksMime ? decodeEml(raw) : isHtml ? stripHtml(raw).trim() : raw.trim();
    return text ? { text, note: "Ready to read" } : { error: "That file has no readable text. Paste the email instead." };
  } catch (err) {
    console.error("readEmailFile", err);
    return { error: `That file couldn't be read. ${SUPPORTED}` };
  }
}
