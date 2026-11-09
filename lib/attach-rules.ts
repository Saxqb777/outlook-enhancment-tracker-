// What can be attached to a point. Shared by the browser and the server.
export const ATT_MAX_BYTES = 10 * 1024 * 1024;
export const ATT_MAX_FILES = 5;

export const ATT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  msg: "application/vnd.ms-outlook",
  eml: "message/rfc822",
  txt: "text/plain",
};
export const ATT_ACCEPT = Object.keys(ATT_TYPES)
  .map((e) => `.${e}`)
  .join(",");

export const extOf = (name: string) => (name.split(".").pop() || "").toLowerCase();
export const mimeFor = (name: string): string | null => ATT_TYPES[extOf(name)] ?? null;
export const isImage = (mime: string) => mime.startsWith("image/") && mime !== "image/heic" && mime !== "image/heif";
export const cleanName = (name: string) =>
  name
    .replace(/[\\/]+/g, "_")
    .replace(/[^\w.\- ()&]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-120) || "file";
export const sizeLabel = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** What the browser sends after a file is uploaded. */
export type Uploaded = { url: string; pathname: string; name: string; size: number };

export function checkFile(f: { name: string; size: number }): string | null {
  if (!mimeFor(f.name)) return `${f.name}: this kind of file can't be attached. Use PDF, photos, Excel, Word, Outlook emails or text.`;
  if (f.size > ATT_MAX_BYTES) return `${f.name} is over 10 MB.`;
  if (f.size === 0) return `${f.name} is empty.`;
  return null;
}
