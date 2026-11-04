// Builds public/sandbox.html (the no-login demo with sample freight data) from
// the design preview in design/preview.html, which is the source of truth.
// Usage: npm run sandbox:build
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = await readFile(path.join(root, "design", "preview.html"), "utf8");

const html = src
  .replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, "")
  .replace(/<title>[^<]*<\/title>/, "<title>Agthia Enhancements · Sandbox</title>");

const split = html.indexOf("</style>");
if (split < 0) throw new Error("design/preview.html has no </style>");
const head = html.slice(0, split) + "\n[hidden]{display:none!important}\n</style>";
const body = html.slice(split + "</style>".length);

const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="Agthia Enhancements sandbox with sample freight data. Nothing is saved.">
${head.trim()}
</head>
<body>
${body.trim()}
</body>
</html>
`;

if (out.includes("Docket")) throw new Error("A 'Docket' mention was left in the sandbox page");
await mkdir(path.join(root, "public"), { recursive: true });
await writeFile(path.join(root, "public", "sandbox.html"), out);
console.log("wrote public/sandbox.html", `(${Math.round(out.length / 1024)} KB)`);
