// Subtitle files and the trickplay index come from the engine under a signed URL, not through the mock.
// Starts its own engine and mock; needs ffmpeg.
import { spawn, execFileSync } from "node:child_process";
import { strictEqual as eq, notStrictEqual as ne, ok } from "node:assert";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
const port = await freePort();
const ENGINE = `http://127.0.0.1:${port}`;
writeFileSync(
	join(dir, "engine.yaml"),
	`listen: 127.0.0.1:${port}\nsecret: ${SECRET}\ntmp_dir: ${join(dir, "live")}\njobs_dir: ${join(dir, "jobs")}\n`,
);
const engine = spawn(
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
const clip = join(dir, "clip.mkv");
writeFileSync(join(dir, "en.srt"), "1\n00:00:01,000 --> 00:00:04,000\nHello there\n\n");
execFileSync("ffmpeg", [
	...["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=d=25:s=640x360:r=24"],
	...["-i", join(dir, "en.srt"), "-map", "0", "-map", "1"],
	...["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:s", "srt"],
	...["-metadata:s:s:0", "language=eng", clip],
]);

type Mock = { stop: () => void; origin: string };
async function startMock(): Promise<Mock> {
	const child = spawn(
		"python3",
		[
			...["dev/mock-streamline.py", "--listen", "127.0.0.1:0", "--secret", SECRET],
			...["--engine", ENGINE, "--public", ENGINE, "--media", `${ID}=${clip}`],
		],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);
	const origin = await new Promise<string>((resolve, reject) => {
		child.once("exit", (code) => reject(new Error(`mock exited with ${code}`)));
		child.stdout.on("data", (chunk) => {
			const m = /listening on \S+:(\d+)/.exec(String(chunk));
			if (m) resolve(`http://127.0.0.1:${m[1]}`);
		});
	});
	return { origin, stop: () => child.kill() };
}

async function tracksOnceReady(origin: string) {
	for (let i = 0; i < 120; i++) {
		const t: any = await fetch(`${origin}/api/v1/playback/media/${ID}/tracks`).then((r) =>
			r.json(),
		);
		if (!t.preparing && t.trickplay) return t;
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error("the mock never finished preparing the clip");
}

const jobOf = (url: string) => /\/media\/([0-9a-f]{32})\//.exec(url)?.[1];

let mock = await startMock();
try {
	const tracks = await tracksOnceReady(mock.origin);
	const vtt: string = tracks.subtitles[0].files.vtt;
	ok(vtt.startsWith(`${ENGINE}/media/`), vtt);

	const plain = await fetch(vtt);
	eq(plain.status, 200);
	ok((await plain.text()).startsWith("WEBVTT"));

	const u = new URL(vtt);
	const sig = u.searchParams.get("sig") as string;
	u.searchParams.set("sig", (sig[0] === "0" ? "1" : "0") + sig.slice(1));
	eq((await fetch(u)).status, 403);

	eq((await fetch(`${mock.origin}/api/v1/playback/media/${ID}/subtitles/x.vtt`)).status, 404);

	const index = await fetch(tracks.trickplay.url);
	eq(index.status, 200);
	const meta: any = await index.json();
	eq(meta.interval, 10);
	const sheetUrl = new URL(tracks.trickplay.url);
	sheetUrl.pathname = sheetUrl.pathname.replace(/[^/]+$/, meta.sheets[0]);
	const sheet = await fetch(sheetUrl);
	eq(sheet.status, 200);
	eq(sheet.headers.get("content-type"), "image/jpeg");

	const before = jobOf(vtt);
	mock.stop();
	const later = new Date(Date.now() + 5000);
	utimesSync(clip, later, later);
	mock = await startMock();
	const again = await tracksOnceReady(mock.origin);
	ne(jobOf(again.subtitles[0].files.vtt), before);
	console.log("media-files-check: ok");
} finally {
	mock.stop();
	process.kill(-(engine.pid as number));
}
