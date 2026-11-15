// Downloads, through the contract proxy: the engine prepares the file, the mock hands out its signed URL.
// Starts its own engine, mock and proxy; needs ffmpeg.
import { spawn, execFileSync } from "node:child_process";
import { strictEqual as eq, notStrictEqual as ne, ok } from "node:assert";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import type { ActivityEvent, DownloadJob, Title, Watch } from "../../src/lib/core/types.ts";

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
function firstLine(child: ReturnType<typeof spawn>, pattern: RegExp) {
	return new Promise<string>((resolve, reject) => {
		child.once("exit", (code) => reject(new Error(`exited with ${code} before ${pattern}`)));
		let seen = "";
		child.stdout?.on("data", (chunk) => {
			seen += String(chunk);
			const m = pattern.exec(seen);
			if (m) resolve(m[1]);
		});
	});
}

const port = await freePort();
const ENGINE = `http://127.0.0.1:${port}`;
const source = readFileSync("dev/engine.yaml", "utf8")
	.replace(/^listen:.*$/m, `listen: 127.0.0.1:${port}`)
	.replace(/^tmp_dir:.*$/m, `tmp_dir: ${join(dir, "live")}`)
	.replace(/^jobs_dir:.*$/m, `jobs_dir: ${join(dir, "jobs")}`);
ok(source.includes(SECRET));
writeFileSync(join(dir, "engine.yaml"), source);

const children: ReturnType<typeof spawn>[] = [];
const engine = spawn(
	"cargo",
	["run", "-q", "-p", "engine", "--", "--config", join(dir, "engine.yaml")],
	{ stdio: ["ignore", "inherit", "inherit"], detached: true },
);
try {
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
	const clipSize = statSync(clip).size;

	const reportPath = join(dir, "report.jsonl");
	writeFileSync(reportPath, "");
	const mock = spawn(
		"python3",
		[
			...["dev/mock-streamline.py", "--listen", "127.0.0.1:0", "--secret", SECRET],
			...["--engine", ENGINE, "--public", ENGINE, "--clip", clip],
		],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);
	children.push(mock);
	const mockAt = await firstLine(mock, /listening on (\S+)/);
	const proxy = spawn(
		process.execPath,
		[
			...["dev/contract/proxy.ts", "--listen", "127.0.0.1:0", "--upstream", `http://${mockAt}`],
			...["--spec", "docs/contract/player.openapi.yaml", "--report", reportPath],
		],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);
	children.push(proxy);
	const root = `http://${await firstLine(proxy, /listening on (\S+)/)}`;
	const api = `${root}/extensions/player`;
	const direct = `http://${mockAt}`;

	const J = { "Content-Type": "application/json" };
	async function pair(name: string) {
		const code: { device_code: string } = await fetch(`${api}/auth/device/code`, {
			method: "POST",
			headers: J,
			body: JSON.stringify({ client_id: name, name, platform: "linux" }),
		}).then((r) => r.json());
		eq((await fetch(`${direct}/dev/approve`, { method: "POST" })).status, 200);
		const token: { api_key: string } = await fetch(`${api}/auth/device/token`, {
			method: "POST",
			headers: J,
			body: JSON.stringify({ device_code: code.device_code }),
		}).then((r) => r.json());
		return { "X-API-Key": token.api_key as string };
	}
	const mine = await pair("desktop-a");
	const other = await pair("desktop-b");

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
	eq(tracks.audio.length, 2);
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
	eq(done.size, clipSize);
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
		const r = await fetch(`${direct}/extensions/player/downloads`, {
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
	const browser: { access_token: string } = await fetch(`${api}/auth/token`, {
		method: "POST",
		headers: J,
		body: JSON.stringify({
			grant_type: "password",
			email: "antoine@example.net",
			password: "streamline",
			device_name: "Firefox",
		}),
	}).then((r) => r.json());
	const asBrowser = { Authorization: `Bearer ${browser.access_token}` };
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
	await fetch(`${direct}/dev/downloads/fail`, { method: "POST" });
	const broken: DownloadJob = await post(body()).then((r) => r.json());
	eq(broken.state, "failed");
	eq(((await get(broken.id).then((r) => r.json())) as ApiError).error.code, "prepare_failed");
	eq(
		(await fetch(`${api}/downloads/${broken.id}/complete`, { method: "POST", headers: mine }))
			.status,
		409,
	);

	eq((await feed(mine)).filter((e) => e.kind === "download").length, 0);
	eq(
		(await fetch(`${api}/downloads/${first.id}/complete`, { method: "POST", headers: mine }))
			.status,
		204,
	);
	const events = await feed(mine);
	eq(events[0].kind, "download");
	eq(events[0].read, false);
	eq(events[0].title.id, movie.id);
	eq((await feed(other)).filter((e) => e.kind === "download").length, 0);
	eq(
		(
			await fetch(`${ENGINE}/v1/jobs/${first.id}`, {
				headers: { Authorization: `Bearer ${SECRET}` },
			})
		).status,
		404,
	);

	for (const id of [slow.id, broken.id]) {
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

	ok(existsSync(reportPath));
	const report = readFileSync(reportPath, "utf8").split("\n").filter(Boolean);
	eq(report.length, 0, report.join("\n"));
	console.log("downloads-api-check: ok");
} finally {
	for (const c of children) c.kill();
	process.kill(-(engine.pid as number));
}
