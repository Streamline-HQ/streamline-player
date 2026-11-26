// node dev/tv-package-paths.ts — makes build/index.html load from wherever it sits, for the TV
// packages run from file://. Kit writes the page as an SPA fallback, which always gets absolute
// paths; the chunks already load relative to it. The boot script's CSP hash follows its new text.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "build/index.html";
const sha = (body: string) => `'sha256-${createHash("sha256").update(body).digest("base64")}'`;

let html = readFileSync(FILE, "utf8");
for (const [, body = ""] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
	const relative = body.replaceAll('import("/', 'import("./');
	html = html.replace(body, relative).replace(sha(body), sha(relative));
}
html = html.replace(/\b(src|href)="\/(?!\/)/g, '$1="./');
writeFileSync(FILE, html);
