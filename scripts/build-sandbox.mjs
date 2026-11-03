// Builds public/sandbox.html (the no-login demo with sample data) from the
// approved design preview in design/preview.html.
// Usage: npm run sandbox:build
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = await readFile(path.join(root, "design", "preview.html"), "utf8");

let html = src
  .replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, "")
  .replace("<title>Docket</title>", "<title>Agthia Enhancements · Sandbox</title>")
  .replace('aria-label="Docket home"', 'aria-label="Agthia Enhancements home"')
  .replace(
    "</svg><span>Docket</span></a>",
    '</svg><span class="brand-t">Agthia <span>Enhancements</span></span></a>',
  )
  .replace(
    "<span><b>Preview</b> · sample data, nothing is saved</span>",
    '<span><b>Sandbox</b> · sample data, nothing is saved · <a href="/login">Sign in</a></span>',
  )
  .replaceAll("docket-preview-role", "agthia-sandbox-role")
  .replaceAll("docket-tour", "agthia-sandbox-tour")
  .replaceAll("Docket", "Agthia Enhancements");

const extraCss = `
[hidden]{display:none!important}
.brand-t{white-space:nowrap}
.brand-t span{font-weight:500;color:var(--ink-3)}
@media (max-width:1180px){.brand-t span{display:none}}
.pv a{color:var(--ink);font-weight:600;text-decoration:underline;text-underline-offset:3px}
`;

const split = html.indexOf("</style>");
if (split < 0) throw new Error("design/preview.html has no </style>");
const head = html.slice(0, split) + extraCss + "</style>";
const body = html.slice(split + "</style>".length);

const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="Agthia Enhancements sandbox with sample data. Nothing is saved.">
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
