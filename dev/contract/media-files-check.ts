// Subtitle files and the trickplay index come from the engine under a signed URL, not through the API.
// On the mock it starts its own engine and a mock on a clip; needs ffmpeg. On the stack it uses the stack's engine and library.
import { spawn, execFileSync } from "node:child_process";
import { strictEqual as eq, notStrictEqual as ne, ok } from "node:assert";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Title } from "../../src/lib/core/types.ts";
import { kind, startTarget, violationLines, type Target } from "./target.ts";

type Tracks = {
	preparing?: boolean;
	trickplay?: { url: string };
	subtitles: { files: { vtt: string } }[];
};

const SECRET = "dev-secret-0123456789abcdef";
const ID = "clip";

const dir = mkdtempSync(join(tmpdir(), "media-files-"));
const freePort = () =>
	new Promise<number>((resolve) => {
		const s = createServer().listen(0, "127.0.0.1", () => {
			const { port } = s.address() as { port: number };
			s.close(() => resolve(port));
		});
	});
let engine: ReturnType<typeof spawn> | undefined;
let ENGINE = "";
const clip = join(dir, "clip.mkv");
if (kind === "mock") {
	const port = await freePort();
	ENGINE = `http://127.0.0.1:${port}`;
	writeFileSync(
		join(dir, "engine.yaml"),
		`listen: 127.0.0.1:${port}\nsecret: ${SECRET}\ntmp_dir: ${join(dir, "live")}\njobs_dir: ${join(dir, "jobs")}\n`,
	);
	engine = spawn(
		"cargo",
		["run", "-q", "-p", "engine", "--", "--config", join(dir, "engine.yaml")],
		{
			stdio: ["ignore", "inherit", "inherit"],
			detached: true,
		},
	);
	for (let up = false; !up; ) {
		if (engine.exitCode !== null) throw new Error("the engine exited");
		up = await fetch(`${ENGINE}/v1/health`).then(
			() => true,
			() => false,
		);
		if (!up) await new Promise((r) => setTimeout(r, 500));
	}
	writeFileSync(join(dir, "en.srt"), "1\n00:00:01,000 --> 00:00:04,000\nHello there\n\n");
	execFileSync("ffmpeg", [
		...["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=d=25:s=640x360:r=24"],
		...["-i", join(dir, "en.srt"), "-map", "0", "-map", "1"],
		...["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:s", "srt"],
		...["-metadata:s:s:0", "language=eng", clip],
	]);
}

type Open = { t: Target; auth: { Authorization: string }; mediaId: string };
async function open(name: string): Promise<Open> {
	const t = await startTarget(
		name,
		kind === "mock"
			? ["--secret", SECRET, "--engine", ENGINE, "--public", ENGINE, "--media", `${ID}=${clip}`]
			: [],
	);
	const auth = { Authorization: `Bearer ${await t.signIn()}` };
	if (kind === "mock") return { t, auth, mediaId: ID };
	const list: { items: Title[] } = await fetch(`${t.api}/movies`, { headers: auth }).then((r) =>
		r.json(),
	);
	const movie: Title = await fetch(`${t.api}/movies/${list.items[0].id}`, { headers: auth }).then(
		(r) => r.json(),
	);
	return { t, auth, mediaId: movie.media_files[0].id };
}

async function tracksOnceReady({ t, auth, mediaId }: Open) {
	for (let i = 0; i < 120; i++) {
		const t2: Tracks = await fetch(`${t.api}/playback/media/${mediaId}/tracks`, {
			headers: auth,
		}).then((r) => r.json());
		if (!t2.preparing && t2.trickplay) return t2;
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error("the file was never prepared");
}

const jobOf = (url: string) => /\/media\/([0-9a-f]{32})\//.exec(url)?.[1];

let target = await open("media");
try {
	const engineOrigin = kind === "mock" ? ENGINE : (target.t.engine as string);
	const tracks = await tracksOnceReady(target);
	ok(tracks.subtitles.length > 0, "the file has a subtitle track");
	const vtt: string = tracks.subtitles[0].files.vtt;
	ok(vtt.startsWith(`${engineOrigin}/media/`), vtt);

	const plain = await fetch(vtt);
	eq(plain.status, 200);
	ok((await plain.text()).startsWith("WEBVTT"));

	const u = new URL(vtt);
	const sig = u.searchParams.get("sig") as string;
	u.searchParams.set("sig", (sig[0] === "0" ? "1" : "0") + sig.slice(1));
	eq((await fetch(u)).status, 403);

	eq(
		(
			await fetch(`${target.t.direct}/playback/media/${target.mediaId}/subtitles/x.vtt`, {
				headers: target.auth,
			})
		).status,
		404,
	);

	const index = await fetch((tracks.trickplay as { url: string }).url);
	eq(index.status, 200);
	const meta: { interval: number; sheets: string[] } = await index.json();
	eq(meta.interval, 10);
	const sheetUrl = new URL((tracks.trickplay as { url: string }).url);
	sheetUrl.pathname = sheetUrl.pathname.replace(/[^/]+$/, meta.sheets[0]);
	const sheet = await fetch(sheetUrl);
	eq(sheet.status, 200);
	eq(sheet.headers.get("content-type"), "image/jpeg");

	// A file replaced under the same media id is a mock-only step: the stack's files live in a directory the check does not know.
	if (kind === "mock") {
		const before = jobOf(vtt);
		target.t.stop();
		const later = new Date(Date.now() + 5000);
		utimesSync(clip, later, later);
		target = await open("media-again");
		const again = await tracksOnceReady(target);
		ne(jobOf(again.subtitles[0].files.vtt), before);
	}
	const lines = await violationLines(target.t);
	eq(lines.length, 0, lines.join("\n"));
	console.log("media-files-check: ok");
} finally {
	target.t.stop();
	if (engine) process.kill(-(engine.pid as number));
}
