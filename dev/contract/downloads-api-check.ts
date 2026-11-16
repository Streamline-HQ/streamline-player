// Downloads, through the contract proxy: the engine prepares the file, the API hands out its signed URL.
// On the mock it starts its own engine and a mock on a clip; needs ffmpeg. On the stack it uses the stack's engine and library.
import { spawn, execFileSync } from "node:child_process";
import { strictEqual as eq, notStrictEqual as ne, ok } from "node:assert";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import type { ActivityEvent, DownloadJob, Title, Watch } from "../../src/lib/core/types.ts";
import { kind, startTarget, violationLines } from "./target.ts";

type ApiError = { error: { code: string } };

const SECRET = "dev-secret-0123456789abcdef";
const dir = "/tmp/streamline-player/downloads";
mkdirSync(dir, { recursive: true });
const freePort = () =>
	new Promise<number>((resolve) => {
		const s = createServer().listen(0, "127.0.0.1", () => {
			const { port } = s.address() as { port: number };
			s.close(() => resolve(port));
		});
	});

let engine: ReturnType<typeof spawn> | undefined;
let stop = () => {};
try {
	let ENGINE = "";
	let clipSize = 0;
	const mockArgs: string[] = [];
	if (kind === "mock") {
		const port = await freePort();
		ENGINE = `http://127.0.0.1:${port}`;
		const source = readFileSync("dev/engine.yaml", "utf8")
			.replace(/^listen:.*$/m, `listen: 127.0.0.1:${port}`)
			.replace(/^tmp_dir:.*$/m, `tmp_dir: ${join(dir, "live")}`)
			.replace(/^jobs_dir:.*$/m, `jobs_dir: ${join(dir, "jobs")}`);
		ok(source.includes(SECRET));
		writeFileSync(join(dir, "engine.yaml"), source);
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
		const clip = join(dir, "clip.mkv");
		execFileSync("ffmpeg", [
			...["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=d=3:s=320x180:r=24"],
			...["-f", "lavfi", "-i", "sine=d=3", "-f", "lavfi", "-i", "sine=f=880:d=3"],
			...["-map", "0", "-map", "1", "-map", "2", "-c:v", "libx264", "-preset", "ultrafast"],
			...["-pix_fmt", "yuv420p", "-c:a", "aac", clip],
		]);
		clipSize = statSync(clip).size;
		mockArgs.push("--secret", SECRET, "--engine", ENGINE, "--public", ENGINE, "--clip", clip);
	}

	const t = await startTarget("downloads", mockArgs);
	stop = t.stop;
	const { api, direct } = t;
	if (kind === "stack") ENGINE = t.engine as string;

	const J = { "Content-Type": "application/json" };
	const mine = { "X-API-Key": await t.appKey("desktop-a", "ana") };
	const other = { "X-API-Key": await t.appKey("desktop-b", "ben") };

	const movies: { items: Title[] } = await fetch(`${api}/movies`, { headers: mine }).then((r) =>
		r.json(),
	);
	const movie: Title = await fetch(`${api}/movies/${movies.items[0].id}`, { headers: mine }).then(
		(r) => r.json(),
	);
	const mediaId: string = movie.media_files[0].id;

	let tracks: { audio: { index: number }[] };
	for (let i = 0; i < 60; i++) {
		tracks = await fetch(`${api}/playback/media/${mediaId}/tracks`, { headers: mine }).then((r) =>
			r.json(),
		);
		if (tracks.audio.length) break;
		await new Promise((r) => setTimeout(r, 500));
	}
	if (kind === "mock") eq(tracks.audio.length, 2);
	else ok(tracks.audio.length >= 1, "the file has an audio track");
	const audio: number[] = tracks.audio.map((a) => a.index);
	const capabilities = {
		video: [
			{
				codec: "h264",
				profiles: ["high"],
				max_level: 52,
				max_width: 3840,
				max_height: 2160,
				max_fps: 60,
			},
		],
		hdr: { formats: [], dv_profiles: [] },
		audio: { codecs: ["aac", "ac3", "eac3"], max_channels: 6, passthrough: [] },
		containers: ["mkv", "mp4"],
		subtitles: ["srt"],
		hls_keyframe_exact: false,
	};
	const body = (extra: object = {}) =>
		JSON.stringify({
			media_id: mediaId,
			quality: "original",
			audio_indexes: audio,
			capabilities,
			...extra,
		});
	const post = (b: string, headers: object = mine) =>
		fetch(`${api}/downloads`, { method: "POST", headers: { ...J, ...headers }, body: b });
	const get = (id: string, headers: object = mine) => fetch(`${api}/downloads/${id}`, { headers });
	const feed = async (headers: object) =>
		(
			(await fetch(`${api}/activity`, { headers }).then((r) => r.json())) as {
				items: ActivityEvent[];
			}
		).items;
	async function ready(id: string, headers: object = mine) {
		for (let i = 0; i < 120; i++) {
			const r = await get(id, headers);
			eq(r.status, 200);
			const job: DownloadJob = await r.json();
			if (job.state !== "preparing") return job;
			await new Promise((res) => setTimeout(res, 500));
		}
		throw new Error("the download never finished preparing");
	}

	const created = await post(body());
	eq(created.status, 201);
	const first: DownloadJob = await created.json();
	const done = await ready(first.id);
	eq(done.state, "ready");
	eq(done.progress, 1);
	if (kind === "mock") eq(done.size, clipSize);
	else ok(done.size > 0);
	ok(done.url.startsWith(`${ENGINE}/dl/`), done.url);

	const ranged = await fetch(done.url, { headers: { Range: "bytes=0-15" } });
	eq(ranged.status, 206);
	eq((await ranged.arrayBuffer()).byteLength, 16);
	const u = new URL(done.url);
	const sig = u.searchParams.get("sig") as string;
	u.searchParams.set("sig", (sig[0] === "0" ? "1" : "0") + sig.slice(1));
	eq((await fetch(u, { headers: { Range: "bytes=0-15" } })).status, 403);

	const again: DownloadJob = await get(first.id).then((r) => r.json());
	eq((await fetch(again.url, { headers: { Range: "bytes=0-15" } })).status, 206);
	const same: DownloadJob = await post(body()).then((r) => r.json());
	eq(same.id, first.id);

	for (const bad of [
		body({ audio_indexes: [] }),
		body({ audio_indexes: [99] }),
		JSON.stringify({ media_id: mediaId, audio_indexes: audio, capabilities }),
	]) {
		// The proxy rightly reports these as breaking the contract, so they skip it.
		const r = await fetch(`${direct}/downloads`, {
			method: "POST",
			headers: { ...J, ...mine },
			body: bad,
		});
		eq(r.status, 400);
		eq(((await r.json()) as ApiError).error.code, "invalid_request");
	}
	const unknown = await post(body({ media_id: "nope" }));
	eq(unknown.status, 404);

	eq((await get(first.id, other)).status, 404);
	const bearer = { Authorization: "Bearer nobody" };
	eq((await get(first.id, bearer)).status, 401);
	const asBrowser = { Authorization: `Bearer ${await t.signIn("ana")}` };
	for (const r of [await get(first.id, asBrowser), await post(body(), asBrowser)]) {
		eq(r.status, 403);
		eq(((await r.json()) as ApiError).error.code, "forbidden");
	}

	const slow: DownloadJob = await post(body({ quality: "720p" })).then((r) => r.json());
	ne(slow.id, first.id);
	if (slow.state === "preparing") {
		eq(
			(await fetch(`${api}/downloads/${slow.id}/complete`, { method: "POST", headers: mine }))
				.status,
			409,
		);
	}
	// The mock can be told to fail the next preparation; the stack has no such switch.
	let broken: DownloadJob | undefined;
	if (t.mock) {
		await fetch(`${t.mock}/dev/downloads/fail`, { method: "POST" });
		broken = await post(body()).then((r) => r.json());
		eq(broken.state, "failed");
		eq(((await get(broken.id).then((r) => r.json())) as ApiError).error.code, "prepare_failed");
		eq(
			(await fetch(`${api}/downloads/${broken.id}/complete`, { method: "POST", headers: mine }))
				.status,
			409,
		);
	}

	const downloads = async (headers: object) =>
		(await feed(headers)).filter((e) => e.kind === "download");
	const seen = (await downloads(mine)).length;
	// The stack keeps its feed between runs, so only the mock's starts without any.
	if (kind === "mock") eq(seen, 0);
	eq(
		(await fetch(`${api}/downloads/${first.id}/complete`, { method: "POST", headers: mine }))
			.status,
		204,
	);
	const events = await feed(mine);
	eq(events[0].kind, "download");
	eq(events[0].read, false);
	eq(events[0].title.id, movie.id);
	eq((await downloads(mine)).length, seen + 1);
	eq((await downloads(other)).length, 0);
	eq(
		(
			await fetch(`${api}/activity/read`, {
				method: "POST",
				headers: { ...J, ...mine },
				body: JSON.stringify({ ids: [events[0].id, "nope"] }),
			})
		).status,
		204,
	);
	eq((await feed(mine)).find((e) => e.id === events[0].id)?.read, true);
	// The engine's secret is the extension's own on the stack, and never leaves it.
	if (kind === "mock") {
		eq(
			(
				await fetch(`${ENGINE}/v1/jobs/${first.id}`, {
					headers: { Authorization: `Bearer ${SECRET}` },
				})
			).status,
			404,
		);
	}

	for (const id of [slow.id, ...(broken ? [broken.id] : [])]) {
		for (let i = 0; i < 2; i++) {
			eq((await fetch(`${api}/downloads/${id}`, { method: "DELETE", headers: mine })).status, 204);
		}
	}

	const put = (b: object) =>
		fetch(`${api}/watchstate/${mediaId}`, {
			method: "PUT",
			headers: { ...J, ...mine },
			body: JSON.stringify(b),
		});
	const now = Date.now();
	let state: Watch = await put({
		position_seconds: 600,
		duration_seconds: 7200,
		at: new Date(now).toISOString(),
	}).then((r) => r.json());
	eq(state.position_seconds, 600);
	const listed = async () =>
		(
			(await fetch(`${api}/watchstate`, { headers: mine }).then((r) => r.json())) as {
				items: Watch[];
			}
		).items.find((w) => w.media_id === mediaId);
	eq((await listed()).position_seconds, 600);
	state = await put({
		position_seconds: 60,
		duration_seconds: 7200,
		at: new Date(now - 3600_000).toISOString(),
	}).then((r) => r.json());
	eq(state.position_seconds, 600);
	eq((await listed()).position_seconds, 600);
	const bad = await put({ position_seconds: 1, duration_seconds: 7200, at: "yesterday" });
	eq(bad.status, 400);
	state = await put({ watched: true }).then((r) => r.json());
	eq(state.watched, true);

	const report = await violationLines(t);
	eq(report.length, 0, report.join("\n"));
	console.log("downloads-api-check: ok");
} finally {
	stop();
	if (engine) process.kill(-(engine.pid as number));
}
