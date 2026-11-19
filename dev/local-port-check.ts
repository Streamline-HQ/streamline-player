// node --import ./dev/controller-check/register.mjs dev/local-port-check.ts
import { ok, strictEqual as eq, deepStrictEqual as same } from "node:assert";
import type { PlaybackPort, Tracks } from "../src/lib/core/playback/port.ts";

const { localPort } = await import("../src/lib/core/playback/local-port.ts");
const { Playback } = await import("../src/lib/core/playback/playback.svelte.ts");

const flush = async () => {
	for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
};

const tracks: Tracks = {
	preparing: false,
	container: "mkv",
	video: { codec: "hevc", width: 3840, height: 2160 },
	chapters: [],
	markers: { intro: null, credits: null },
	audio: [{ index: 2, codec: "eac3", channels: 6, language: "eng", default: true }],
	subtitles: [
		{
			index: 5,
			codec: "subrip",
			language: "eng",
			forced: false,
			sdh: false,
			files: { vtt: "/data/downloads/series-1-1-1/sub-5.vtt" },
		},
	],
	fonts: [],
	trickplay: null,
};

const serverCalls: string[] = [];
const commands: { cmd: string; args?: Record<string, unknown> }[] = [];
const texts: string[] = [];
const refuse = (name: string) => async () => {
	serverCalls.push(name);
	throw new Error(`${name} reached the server`);
};
const base: PlaybackPort = {
	playerName: "mpv",
	command: async (cmd, args) => {
		commands.push({ cmd, args });
		return cmd === "stats" ? {} : null;
	},
	on: async () => () => {},
	capabilities: async () => ({}),
	decisions: refuse("decisions"),
	network: refuse("network"),
	metered: refuse("metered"),
	serverHost: refuse("serverHost"),
	startSession: refuse("startSession"),
	patchSession: refuse("patchSession"),
	sessionInfo: refuse("sessionInfo"),
	stopSession: refuse("stopSession"),
	heartbeat: refuse("heartbeat"),
	mediaTracks: refuse("mediaTracks"),
	mediaText: async (url) => {
		texts.push(url);
		return "1\n00:00:01,000 --> 00:00:02,000\nHi\n";
	},
};

const notes: [string, number, boolean][] = [];
const local = {
	key: "series:1:1:1",
	url: "/data/downloads/series-1-1-1/download.mkv",
	tracks,
	position: 420,
	duration: 3000,
	size: 1.5e9,
};
const port = localPort(base, local, async (key, position, done) => {
	notes.push([key, position, done]);
});

const pb = new Playback(port, {
	mediaId: "dl-1",
	titleName: "T",
	anime: false,
	start: local.position,
});
const end = pb.begin();
await flush();
const load = commands.find((c) => c.cmd === "load");
eq(load?.args?.url, local.url, "load got the local file");
eq(load?.args?.at, 420, "load got the saved position");
same(serverCalls, [], "no server call of the base");
eq(pb.session?.mode, "direct");
eq(pb.session?.session_id.startsWith("local"), true);
same(pb.tracks, tracks);

await pb.pickSub(tracks.subtitles[0]);
same(texts, ["/data/downloads/series-1-1-1/sub-5.vtt"], "subtitle text read from the local path");
same(serverCalls, []);

await port.heartbeat("local-x", 600, false);
await port.heartbeat("local-x", 2800, true);
same(notes, [
	[local.key, 600, false],
	[local.key, 2800, true],
]);

await port.stopSession("x");
const patched = await port.patchSession("x", { audio_index: 2 });
eq(patched.url, local.url);
same(await port.sessionInfo("x"), { speed: null });
eq(await port.network(), "home");
eq(await port.serverHost(), "");
same(await port.mediaTracks("x"), tracks);

const r = await port.decisions("x", [{}, { max_bitrate: 4e6 }, { audio_index: 2 }]);
eq(r.decisions.length, 3);
for (const d of r.decisions) ok(!d.error && d.mode === "direct" && !d.needs_slot);
eq(r.bit_rate, (1.5e9 * 8) / 3000);

await pb.exit();
end();
same(serverCalls, [], "nothing reached the server, leaving included");
const { localKey, localLaunch, localUrl } = await import("../src/lib/core/download-launch.ts");
const meta = {
	kind: "series" as const,
	title_id: 1,
	title: "Severance",
	year: null,
	runtime: 48,
	season: 2,
	episode: 3,
	episode_title: "Who Is Alive?",
	poster: "series/1/poster.jpg",
	still: "series/1/backdrop.jpg",
};
eq(localUrl(meta), "/player/series/1?local=1&s=2&e=3");
eq(
	localUrl({ ...meta, kind: "movies", title_id: 3, season: null, episode: null }),
	"/player/movies/3?local=1",
);
eq(localKey("series", 1, 2, 3), "series:1:2:3");
eq(localKey("movies", 3, null, null), "movies:3");
const entry = { key: "series:1:2:3", media_id: "ep-1", meta } as Parameters<typeof localLaunch>[0];
const launch = localLaunch(entry, (path) => `art://${path}`, 90);
eq(launch.key, "ep-1");
eq(launch.item.start, 90);
eq(launch.view.eyebrow, "Severance · S2 E3");
eq(launch.view.still, "art://series/1/backdrop.jpg");
eq(launch.view.href, "/player/series/1?local=1&s=2&e=3");

console.log("local-port-check: ok");
