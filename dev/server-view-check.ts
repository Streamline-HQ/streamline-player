process.env.TZ = "UTC";
// node dev/server-view-check.ts
import { strictEqual as eq, deepStrictEqual as same, ok } from "node:assert";
import { must } from "./must.ts";
import {
	canRestart,
	commitNumber,
	commitText,
	type AdminData,
	type Row,
	type Section,
	sections,
	status,
	type TextId,
	type Words,
} from "../src/lib/core/server-view.ts";
import type { Title } from "../src/lib/core/types.ts";

const now = new Date("2026-11-09T12:00:00Z");

const EN: Record<TextId, string> = {
	sec_overview: "Overview",
	sec_streams: "Now playing",
	sec_devices: "Devices",
	sec_transcoding: "Transcoding",
	sec_library: "Library",
	sec_overview_intro: "What the engine runs.",
	sec_streams_intro: "Everyone watching right now.",
	sec_devices_intro: "Apps paired with this server.",
	sec_transcoding_intro: "When a player can’t decode a file.",
	sec_library_intro: "The folders the engine serves.",
	group_streaming: "Streaming",
	group_library: "Library",
	cap_now: "Right now",
	cap_engine: "Engine",
	blk_build: "Build & runtime",
	blk_restart: "Restart",
	blk_waiting: "Waiting for approval",
	blk_waiting_desc: "Check the code matches the one on the device. Codes expire after 10 minutes.",
	blk_apps: "Paired apps",
	blk_browsers: "Browser sessions",
	blk_browsers_desc: "Signed in from a web browser.",
	blk_hw: "Hardware acceleration",
	blk_live: "Live streams",
	blk_cache: "Cache",
	blk_cache_desc: "Converted segments are kept while a stream runs.",
	blk_folders: "Folders",
	act_restart_title: "Restart the engine",
	act_restart_desc: "Streams in progress stop for about 10 seconds.",
	act_restart: "Restart",
	act_cache_title: "Clear the cache",
	act_clear: "Clear",
	btn_restart_now: "Restart now",
	btn_scan_all: "Scan all",
	btn_scan: "Scan",
	btn_scanning: "Scanning…",
	btn_revoke: "Revoke",
	tile_streams: "Streams",
	tile_pairing: "Pairing",
	tile_health: "Health",
	tile_url: "Streamline URL",
	tile_cache: "Transcode cache",
	tile_nobody: "Nobody is watching",
	tile_no_requests: "No requests waiting",
	tile_https: "Served over HTTPS",
	tile_http: "Served over HTTP",
	tile_empty: "Empty",
	tile_ffmpeg_missing: "ffmpeg not found",
	tile_engine_down: "Engine unreachable",
	health_ok: "All good",
	health_restart: "Restart needed",
	status_restarting: "Restarting…",
	hw_software: "Software encoding",
	hw_status_desc: "Checked with a short test encode after every change.",
	kv_version: "Version",
	kv_status: "Status",
	kv_ffmpeg: "ffmpeg",
	kv_last_scan: "Last scan",
	pill_off: "Off",
	pill_ready: "Ready",
	pill_not_ready: "Not ready",
	pill_found: "Found",
	pill_not_found: "Not found",
	pill_this_device: "This device",
	pill_this_browser: "This browser",
	pill_new: "New",
	note_nobody: "Nobody is watching right now.",
	note_no_apps: "No apps are paired.",
	note_no_browsers: "No browser sessions.",
	note_cache_cleared: "Cache cleared. Streams in progress rebuild what they need.",
	mode_copy: "Original",
	mode_audio: "Audio transcoded",
	mode_transcode: "Transcoding",
	net_home: "Home network",
	net_remote: "Remote",
	sent_as_is: "sent as-is",
	video_as_is: "video sent as-is",
	kind_browser: "browser",
	kind_tablet: "tablet",
	kind_phone: "phone",
	kind_tv: "TV",
	kind_desktop: "device",
	aside_streaming: "Streaming",
	ago_now: "Now",
	ago_yesterday: "Yesterday",
	vaapi: "VAAPI",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const LABELS: Record<string, string> = {
	"transcoding.hw_accel": "Acceleration",
	"transcoding.hw_device": "Device",
	"stream.tonemap": "Convert HDR for SDR screens",
	"stream.max_live": "Conversions at once",
};
const DESCS: Record<string, string> = {
	"stream.max_live": "Players past this limit wait for a free slot.",
};
const CHOICES: Record<string, string> = {
	auto: "Auto",
	none: "Off",
	vaapi: "VAAPI",
};

const words: Words = {
	t: (id) => EN[id],
	label: (k) => LABELS[k] ?? k,
	desc: (k) => DESCS[k],
	choice: (_k, v) => CHOICES[v] ?? v,
	size: (n, unit) => `${n} ${unit}`,
	streamCount: (n) => plural(n, "stream"),
	appsDesc: (n) => `${plural(n, "device")}, each with its own key in the device’s secure storage.`,
	changeCount: (n) => plural(n, "change"),
	changesWaiting: (n) => `${plural(n, "change")} waiting`,
	restartNote: (n, keys) =>
		`${plural(n, "change")} only ${n === 1 ? "applies" : "apply"} after a restart: ${keys}.`,
	streamSummary: (t, m) => `${t} transcoding · ${m} out`,
	mbps: (n) => `${n} Mbps`,
	you: (name) => `${name} (you)`,
	cannotDecode: (kind, codec) => `this ${kind} can’t decode ${codec}`,
	realtime: (s) => `${s}× realtime`,
	runtime: (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`,
	healthSub: (f, soft) => `ffmpeg ${f} · ${soft ? "software encoding" : "VAAPI ready"}`,
	cacheUsed: (s, n) => `${s} used by ${plural(n, "stream")}.`,
	minutesAgo: (n) => `${n} min ago`,
	hoursAgo: (n) => `${n} h ago`,
	daysAgo: (n) => `${n} days ago`,
	expiresIn: (n) => `expires in ${plural(n, "day")}`,
	folderCount: (kind, n) => (kind === "movies" ? plural(n, "movie") : plural(n, "show")),
	scanProgress: (p, left) => `${p}% · ${left} left`,
	lastScan: (when, a, r, e) =>
		`${when} · ${plural(a, "new file")} · ${r} replaced · ${plural(e, "error")}`,
};

const titles: Record<string, Title> = {
	"series:1": {
		id: 1,
		title: "Severance",
		year: 2022,
		seasons: [
			{ number: 1, name: "Season 1", episodes: [] },
			{
				number: 2,
				name: "Season 2",
				episodes: [{ id: 24, number: 4, title: "Woe’s Hollow" }],
			},
		],
	} as unknown as Title,
	"movies:1": { id: 1, title: "Dune: Part Two", year: 2024, runtime: 166 } as Title,
	"series:4": {
		id: 4,
		title: "Arcane",
		year: 2021,
		seasons: [{ number: 2, name: "Season 2", episodes: [{ id: 42, number: 2, title: "Heavy" }] }],
	} as unknown as Title,
};
const find = (kind: string, id: number) => titles[`${kind}:${id}`];

const demo = (): AdminData => ({
	overview: {
		extension: { version: "0.1.0" },
		engine: {
			reachable: true,
			version: "0.4.2",
			api_version: 1,
			ffmpeg_version: "7.1",
			analysis_version: 1,
			hw: { mode: "vaapi", ready: true },
			libplacebo: true,
			dovi_tool: true,
		},
		storage: { cache: { size: 3200000000, streams: 3 } },
		folders: { reachable: 2, total: 2 },
		streamline_url: "https://streamline.home.arpa",
	},
	settings: {
		values: {
			"transcoding.hw_accel": "auto",
			"transcoding.hw_device": "/dev/dri/renderD128",
			"stream.tonemap": true,
			"stream.max_live": 2,
			"engine.url": "http://engine:8097",
		},
		owners: {
			"transcoding.hw_accel": "engine",
			"transcoding.hw_device": "engine",
			"stream.tonemap": "engine",
			"stream.max_live": "engine",
			"engine.url": "player",
		},
		read_only: { engine: false, player: false },
		pending: [],
		restart_keys: ["transcoding.hw_accel", "transcoding.hw_device"],
	},
	streams: [
		{
			id: "s1",
			user: { name: "Antoine Langlois", you: true },
			title: { kind: "series", id: 1 },
			season: 2,
			episode: 4,
			device: { name: "Living room · SHIELD", kind: "tv" },
			network: "home",
			position: 1872,
			duration: 2940,
			playing: true,
			mode: "copy",
			video: "HEVC Main10 Dolby Vision",
			audio: "EAC3 Atmos 5.1",
			bitrate: 15800000,
		},
		{
			id: "s2",
			user: { name: "Camille Roux", you: false },
			title: { kind: "movies", id: 1 },
			device: { name: "Chrome on Linux", kind: "browser" },
			network: "remote",
			position: 4364,
			duration: 9960,
			playing: true,
			mode: "transcode",
			from: "HEVC Main10 HDR10",
			to: "H.264 1080p SDR",
			hw: "VAAPI",
			speed: 2.1,
			cannot_decode: "HEVC",
			bitrate: 8000000,
		},
		{
			id: "s3",
			user: { name: "Hugo Bernard", you: false },
			title: { kind: "series", id: 4 },
			season: 2,
			episode: 2,
			device: { name: "Galaxy Tab S9", kind: "tablet" },
			network: "home",
			position: 1205,
			duration: 2460,
			playing: false,
			mode: "audio",
			from: "EAC3 5.1",
			to: "AAC 5.1",
			cannot_decode: "EAC3",
			bitrate: 6100000,
		},
	],
	pairings: [
		{
			user_code: "R4W-X9P",
			name: "iPad mini",
			platform: "iPadOS",
			created_at: "2026-11-09T11:58:00+00:00",
			expires_at: "2026-11-09T12:08:00+00:00",
		},
	],
	devices: [
		{
			id: "dev-self",
			kind: "app",
			name: "Desktop · app",
			platform: "Linux",
			last_seen: "2026-11-09T12:00:00+00:00",
			streaming: false,
			current: true,
			user: { name: "Antoine Langlois" },
			key_store: "Secret Service",
		},
		{
			id: "d2",
			kind: "app",
			name: "Living room · SHIELD",
			platform: "Android TV",
			last_seen: "2026-11-09T12:00:00+00:00",
			streaming: true,
			current: false,
			user: { name: "Antoine Langlois" },
			key_store: "Android Keystore",
		},
		{
			id: "d5",
			kind: "app",
			name: "Pixel 9",
			platform: "Android",
			last_seen: "2026-11-06T12:00:00+00:00",
			streaming: false,
			current: false,
			user: { name: "Camille Roux" },
			key_store: "Android Keystore",
		},
		{
			id: "w1",
			kind: "browser",
			name: "Chrome on Linux",
			platform: "Web browser",
			last_seen: "2026-11-09T12:00:00+00:00",
			streaming: true,
			current: false,
			user: { name: "Camille Roux" },
			expires_at: "2026-11-15T12:00:00+00:00",
		},
		{
			id: "w2",
			kind: "browser",
			name: "Safari on macOS",
			platform: "Web browser",
			last_seen: "2026-11-04T12:00:00+00:00",
			streaming: false,
			current: false,
			user: { name: "Hugo Bernard" },
			expires_at: "2026-11-11T12:00:00+00:00",
		},
	],
	library: {
		folders: [
			{
				id: "movies",
				name: "Movies",
				path: "/media/movies",
				kind: "movies",
				count: 42,
				size: 1300000000000,
			},
			{
				id: "series",
				name: "Series",
				path: "/media/series",
				kind: "series",
				count: 28,
				size: 2200000000000,
			},
		],
		last_scan: { at: "2026-11-03T03:00:00+00:00", added: 4, replaced: 2, errors: 0 },
	},
	cacheCleared: false,
	web: false,
	tick: 0,
});

const build = (d: AdminData = demo()) => sections(d, find, now, "en", words);
const section = (s: Section[], key: string) => must(s.find((x) => x.key === key));
const rows = (s: Section) => s.blocks.flatMap((b) => b.rows);
const titled = (s: Section, title: string) => must(s.blocks.find((b) => b.title === title));
const kinds = <T extends Row["t"]>(r: Row[], t: T) =>
	r.filter((x): x is Extract<Row, { t: T }> => x.t === t);
const setting = (s: Section[], key: string) =>
	s.flatMap(rows).find((r) => "key" in r && r.key === key) as Extract<Row, { key: string }>;
const hasRestart = (s: Section[]) => JSON.stringify(s).includes('"do":"restart"');

const all = build();
same(
	all.map((s) => s.title),
	["Overview", "Now playing", "Devices", "Transcoding", "Library"],
);
same(
	all.map((s) => s.group),
	["", "Streaming", "Streaming", "Streaming", "Library"],
);
eq(section(all, "streams").count, 3);
eq(section(all, "devices").badge, 1);
eq(section(all, "overview").badge, undefined);

const tiles = kinds(rows(section(all, "overview")), "tiles").flatMap((t) => t.tiles);
const tile = (label: string) => must(tiles.find((t) => t.label === label));
eq(tile("Streams").value, "3");
eq(tile("Streams").sub, "1 transcoding · 29.9 Mbps out");
eq(tile("Pairing").value, "1");
eq(tile("Pairing").sub, "iPad mini");
eq(tile("Health").value, "All good");
eq(tile("Health").sub, "ffmpeg 7.1 · VAAPI ready");
eq(tile("Transcode cache").value, "3.2 GB");
eq(tile("Transcode cache").sub, "3 streams");
eq(tile("Streamline URL").mono, true);
eq(tile("Streamline URL").value, "https://streamline.home.arpa");
eq(tile("Streamline URL").sub, "Served over HTTPS");
eq(
	tiles.some((t) => ["Media storage", "Data directory", "Database"].includes(t.label)),
	false,
);

const build_ = titled(section(all, "overview"), "Build & runtime").rows as Extract<
	Row,
	{ t: "kv" }
>[];
same(
	build_.map((r) => [r.label, r.value]),
	[
		["Version", "Player extension 0.1.0"],
		["Engine", "0.4.2 (API 1)"],
		["ffmpeg", "7.1"],
	],
);
const noEngine = demo();
noEngine.overview.engine = { reachable: false };
noEngine.overview.storage = {};
const downOverview = section(build(noEngine), "overview");
same(
	(titled(downOverview, "Build & runtime").rows as Extract<Row, { t: "kv" }>[]).map((r) => r.label),
	["Version"],
);
const downTiles = kinds(rows(downOverview), "tiles").flatMap((t) => t.tiles);
const downHealth = must(downTiles.find((t) => t.label === "Health"));
same([downHealth.value, downHealth.tone], ["Engine unreachable", "err"]);
eq(
	downTiles.some((t) => t.label === "Transcode cache"),
	false,
);
same(titled(section(build(noEngine), "transcoding"), "Cache").rows, [
	{ t: "note", tone: "warn", text: "Engine unreachable" },
]);
const soft0 = build(noEngine);
eq(setting(soft0, "transcoding.hw_accel").value, "auto");
eq(setting(soft0, "stream.tonemap").value, true);
const emptyCache = demo();
must(emptyCache.overview.storage.cache).size = 0;
eq(
	must(
		kinds(rows(section(build(emptyCache), "overview")), "tiles")
			.flatMap((t) => t.tiles)
			.find((t) => t.label === "Transcode cache"),
	).value,
	"Empty",
);
eq(must(tiles.find((t) => t.label === "Streamline URL")).tone, "ok");
const plainHttp = demo();
plainHttp.overview.streamline_url = "http://10.0.0.2:8080";
eq(
	must(
		kinds(rows(section(build(plainHttp), "overview")), "tiles")
			.flatMap((t) => t.tiles)
			.find((t) => t.label === "Streamline URL"),
	).sub,
	"Served over HTTP",
);

const stream = (s: Section[], id: string) =>
	must(kinds(rows(section(s, "streams")), "stream").find((r) => r.id === id));
const sev = stream(all, "s1");
eq(sev.title, "Severance");
ok(sev.sub.startsWith("S2 E4 · "));
eq(sev.user, "Antoine Langlois (you)");
eq(sev.short, "Antoine");
eq(sev.mode, "Original");
eq(sev.tone, "ok");
eq(sev.path, "HEVC Main10 Dolby Vision · EAC3 Atmos 5.1 · sent as-is");
eq(sev.mbps, "15.8 Mbps");
eq(sev.time, "31:12 / 49:00");
eq(sev.where, "Home network");
eq(sev.poster, titles["series:1"]);
const dune = stream(all, "s2");
eq(dune.mode, "Transcoding");
eq(dune.tone, "warn");
eq(
	dune.path,
	"HEVC Main10 HDR10 → H.264 1080p SDR · VAAPI · 2.1× realtime · this browser can’t decode HEVC",
);
eq(dune.sub, "2024 · 2h 46m");
eq(dune.time, "1:12:44 / 2:46:00");
eq(dune.where, "Remote");
const arc = stream(all, "s3");
eq(arc.mode, "Audio transcoded");
eq(arc.tone, "accent");
ok(arc.path.endsWith("video sent as-is · this tablet can’t decode EAC3"));
eq(arc.playing, false);

const ticked = demo();
ticked.tick = 3;
eq(stream(build(ticked), "s1").time, "31:15 / 49:00");
eq(stream(build(ticked), "s3").time, "20:05 / 41:00");

const quiet = demo();
quiet.streams = [];
const quietAll = build(quiet);
const quietTile = must(
	kinds(rows(section(quietAll, "overview")), "tiles")
		.flatMap((t) => t.tiles)
		.find((t) => t.label === "Streams"),
);
eq(quietTile.value, "0");
eq(quietTile.sub, "Nobody is watching");
eq(quietTile.tone, "muted");
same(rows(section(quietAll, "streams")), [
	{ t: "note", tone: "muted", text: "Nobody is watching right now." },
]);

const devices = section(all, "devices");
eq(must(devices.blocks[0]).title, "Waiting for approval");
eq(must(devices.blocks[0]).desc, EN.blk_waiting_desc);
same(must(devices.blocks[0]).rows, [
	{ t: "pair", code: "R4W-X9P", device: "iPad mini", icon: "tablet", sub: "iPadOS · 2 min ago" },
]);
const noPair = demo();
noPair.pairings = [];
eq(must(section(build(noPair), "devices").blocks[0]).title, "Paired apps");
eq(section(build(noPair), "devices").badge, undefined);
eq(
	must(
		kinds(rows(section(build(noPair), "overview")), "tiles")
			.flatMap((t) => t.tiles)
			.find((t) => t.label === "Pairing"),
	).sub,
	"No requests waiting",
);

const apps = titled(devices, "Paired apps");
eq(apps.desc, "3 devices, each with its own key in the device’s secure storage.");
const item = (b: { rows: Row[] }, title: string) =>
	must(kinds(b.rows, "item").find((r) => r.title === title));
const pixel = item(apps, "Pixel 9");
eq(pixel.meta, "Android · Camille Roux · Android Keystore");
eq(pixel.aside, "3 days ago");
eq(pixel.icon, "smartphone");
same(pixel.buttons, [
	{ label: "Revoke", act: { do: "revoke", id: "d5" }, tone: "danger", disabled: false },
]);
const bare = demo();
delete must(bare.devices[2]).key_store;
eq(
	item(titled(section(build(bare), "devices"), "Paired apps"), "Pixel 9").meta,
	"Android · Camille Roux",
);
const shield = item(apps, "Living room · SHIELD");
eq(shield.aside, "Streaming");
eq(shield.asideTone, "ok");
eq(shield.icon, "tv");
const self = item(apps, "Desktop · app");
same(self.pills, [["This device", "accent"]]);
same(self.buttons, []);
const web = demo();
web.web = true;
must(web.devices[0]).kind = "browser";
const webSessions = titled(section(build(web), "devices"), "Browser sessions");
same(item(webSessions, "Desktop · app").pills, [["This browser", "accent"]]);

const sessions = titled(devices, "Browser sessions");
eq(sessions.desc, "Signed in from a web browser.");
const safari = item(sessions, "Safari on macOS");
eq(safari.meta, "Hugo Bernard · expires in 2 days");
eq(safari.aside, "5 days ago");
eq(item(sessions, "Chrome on Linux").meta, "Camille Roux · expires in 6 days");
same(safari.buttons, [
	{ label: "Revoke", act: { do: "end", id: "w2" }, tone: "danger", disabled: false },
]);

const empty = demo();
empty.devices = [];
const emptyDevices = section(build(empty), "devices");
same(titled(emptyDevices, "Paired apps").rows, [
	{ t: "note", tone: "muted", text: "No apps are paired." },
]);
same(titled(emptyDevices, "Browser sessions").rows, [
	{ t: "note", tone: "muted", text: "No browser sessions." },
]);

const tr = section(all, "transcoding");
const hwRows = titled(tr, "Hardware acceleration").rows;
const accel = setting(all, "transcoding.hw_accel");
same(accel.options, [
	["auto", "Auto"],
	["none", "Off"],
	["vaapi", "VAAPI"],
]);
eq(accel.value, "auto");
eq((hwRows[1] as { disabled: boolean }).disabled, false);
same(hwRows[2], {
	t: "kv",
	label: "Status",
	value: "VAAPI",
	pill: ["Ready", "ok"],
	desc: EN.hw_status_desc,
});
const soft = demo();
soft.settings.values["transcoding.hw_accel"] = "none";
const softAll = build(soft);
const softRows = titled(section(softAll, "transcoding"), "Hardware acceleration").rows;
eq((softRows[1] as { disabled: boolean }).disabled, true);
same(softRows[2], {
	t: "kv",
	label: "Status",
	value: "Software encoding",
	pill: ["Off", "muted"],
	desc: EN.hw_status_desc,
});
eq(
	must(
		kinds(rows(section(softAll, "overview")), "tiles")
			.flatMap((t) => t.tiles)
			.find((t) => t.label === "Health"),
	).sub,
	"ffmpeg 7.1 · software encoding",
);
for (const patch of [{ ready: false }, { mode: "software" as const }]) {
	const d = demo();
	Object.assign(must(d.overview.engine.hw), patch);
	eq(
		must(
			kinds(rows(section(build(d), "overview")), "tiles")
				.flatMap((t) => t.tiles)
				.find((t) => t.label === "Health"),
		).sub,
		"ffmpeg 7.1 · software encoding",
	);
}
const softMode = demo();
must(softMode.overview.engine.hw).mode = "software";
same(titled(section(build(softMode), "transcoding"), "Hardware acceleration").rows[2], {
	t: "kv",
	label: "Status",
	value: "Software encoding",
	pill: ["Ready", "ok"],
	desc: EN.hw_status_desc,
});
eq(setting(all, "stream.max_live").min, 1);
eq(setting(all, "stream.max_live").max, 8);
const cache = titled(tr, "Cache").rows;
eq((cache[0] as { desc: string }).desc, "3.2 GB used by 3 streams.");
const cleared = demo();
cleared.cacheCleared = true;
same(titled(section(build(cleared), "transcoding"), "Cache").rows[0], {
	t: "note",
	tone: "ok",
	text: EN.note_cache_cleared,
});

const lib = section(all, "library");
const folders = titled(lib, "Folders");
eq(folders.button?.label, "Scan all");
const movies = item(folders, "Movies");
eq(movies.meta, "/media/movies");
eq(movies.aside, "42 movies · 1.3 TB");
same(movies.buttons, [
	{ label: "Scan", act: { do: "scan", folder: "movies" }, tone: "ghost", disabled: false },
]);
eq(item(folders, "Series").aside, "28 shows · 2.2 TB");
same(folders.rows.at(-1), {
	t: "kv",
	label: "Last scan",
	value: "Tue 03:00 · 4 new files · 2 replaced · 0 errors",
});
const scanning = demo();
must(scanning.library.folders[0]).scan = { progress: 0.5, eta_seconds: 8 };
const scanned = item(titled(section(build(scanning), "library"), "Folders"), "Movies");
eq(must(scanned.buttons[0]).label, "Scanning…");
eq(must(scanned.buttons[0]).disabled, true);
eq(scanned.aside, "50% · 0:08 left");
eq(scanned.progress, 0.5);
eq(item(titled(section(build(scanning), "library"), "Folders"), "Series").progress, undefined);

for (const r of all.flatMap(rows)) if ("restart" in r) eq(r.restart, false);
eq(hasRestart(all), true);
const waiting = demo();
waiting.settings.pending = ["transcoding.hw_accel", "stream.tonemap"];
const waitAll = build(waiting);
eq(setting(waitAll, "transcoding.hw_accel").restart, true);
eq(setting(waitAll, "stream.tonemap").restart, true);
eq(setting(waitAll, "stream.max_live").restart, false);
const ov = section(waitAll, "overview");
same(must(ov.blocks[1]).rows, [
	{
		t: "note",
		tone: "warn",
		text: "2 changes only apply after a restart: transcoding.hw_accel, stream.tonemap.",
		button: ["Restart now", { do: "restart" }],
	},
]);
const waitHealth = must(
	kinds(rows(ov), "tiles")
		.flatMap((t) => t.tiles)
		.find((t) => t.label === "Health"),
);
eq(waitHealth.value, "Restart needed");
eq(waitHealth.sub, "2 changes waiting");
eq(waitHealth.tone, "warn");
same(status(waiting, false, words), { label: "Restart needed", tone: "warn" });
same(status(waiting, true, words), { label: "Restarting…", tone: "warn" });
same(status(demo(), false, words), { label: "All good", tone: "ok" });
const one = demo();
one.settings.pending = ["stream.tonemap"];
eq(
	(must(section(build(one), "overview").blocks[1]).rows[0] as { text: string }).text,
	"1 change only applies after a restart: stream.tonemap.",
);

const locked = demo();
locked.settings.read_only.engine = true;
locked.settings.pending = ["stream.tonemap"];
const lockedAll = build(locked);
for (const key of [
	"transcoding.hw_accel",
	"transcoding.hw_device",
	"stream.tonemap",
	"stream.max_live",
])
	eq(setting(lockedAll, key).locked, true, key);
eq(canRestart(locked.settings), false);
eq(hasRestart(lockedAll), false);
eq(canRestart(demo().settings), true);
for (const r of build().flatMap(rows)) if ("locked" in r) eq(r.locked, false);

const during = sections(one, find, now, "en", words, true);
const duringNote = must(section(during, "overview").blocks[1]).rows[0] as {
	button: [string, unknown];
	disabled?: boolean;
};
same([duringNote.button[0], duringNote.disabled], ["Restarting…", true]);
const duringAct = must(kinds(rows(section(during, "overview")), "action")[0]);
same([duringAct.button, duringAct.disabled], ["Restarting…", true]);
const idleAct = must(kinds(rows(section(build(), "overview")), "action")[0]);
same([idleAct.button, idleAct.disabled], ["Restart", undefined]);

const approved = demo();
approved.fresh = [must(approved.devices.find((d) => !d.current && d.kind === "app")).name];
const freshRows = kinds(rows(section(build(approved), "devices")), "item").filter((r) =>
	r.pills.some((p) => p[0] === "New"),
);
eq(freshRows.length, 1);
eq(must(must(freshRows[0]).pills[0])[1], "ok");

eq(commitNumber("abc", 1, 8), null);
eq(commitNumber("999", 1, 8), 8);
eq(commitNumber("0", 1, 8), 1);
eq(commitNumber("2.6", 1, 8), 3);
eq(commitNumber("", 1, 8), null);
eq(commitText("  ", false), null);
eq(commitText("", true), "");
eq(commitText(" a ", false), "a");

console.log("server-view-check: ok");
