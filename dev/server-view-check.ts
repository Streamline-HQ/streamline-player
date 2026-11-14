process.env.TZ = "UTC";
// node dev/server-view-check.ts
import { strictEqual as eq, deepStrictEqual as same, ok } from "node:assert";
import {
	canRestart,
	commitNumber,
	commitText,
	logFilter,
	type AdminData,
	type Row,
	type Section,
	sections,
	status,
	type TextId,
	type Words,
} from "../src/lib/core/server-view.ts";
import type { LogLine, Title } from "../src/lib/core/types.ts";

const now = new Date("2026-11-09T12:00:00Z");

const EN: Record<TextId, string> = {
	sec_overview: "Overview",
	sec_streams: "Now playing",
	sec_devices: "Devices",
	sec_transcoding: "Transcoding",
	sec_library: "Library",
	sec_logs: "Logs",
	sec_overview_intro: "What the engine runs.",
	sec_streams_intro: "Everyone watching right now.",
	sec_devices_intro: "Apps paired with this server.",
	sec_transcoding_intro: "When a player can’t decode a file.",
	sec_library_intro: "The folders the engine serves.",
	sec_logs_intro: "What the engine writes about itself.",
	group_streaming: "Streaming",
	group_library: "Library",
	group_system: "System",
	cap_now: "Right now",
	cap_engine: "Engine",
	blk_build: "Build & runtime",
	blk_config: "Set in the config file",
	blk_config_desc: "Read-only here.",
	blk_telemetry: "Telemetry & retention",
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
	blk_scanning: "Scanning",
	blk_recent: "Recent",
	blk_applog: "Application log",
	blk_accesslog: "Access log",
	blk_rotation: "Rotation",
	act_restart_title: "Restart the engine",
	act_restart_desc: "Streams in progress stop for about 10 seconds.",
	act_restart: "Restart",
	act_cache_title: "Clear the cache",
	act_clear: "Clear",
	btn_restart_now: "Restart now",
	btn_scan_all: "Scan all",
	btn_scan: "Scan",
	btn_scanning: "Scanning…",
	btn_download: "Download",
	btn_revoke: "Revoke",
	tile_streams: "Streams",
	tile_pairing: "Pairing",
	tile_storage: "Media storage",
	tile_health: "Health",
	tile_url: "Public URL",
	tile_data: "Data directory",
	tile_db: "Database",
	tile_cache: "Transcode cache",
	tile_nobody: "Nobody is watching",
	tile_no_requests: "No requests waiting",
	tile_https: "Served over HTTPS",
	tile_http: "Served over HTTP",
	tile_same_disk: "same disk",
	tile_empty: "Empty",
	tile_ffmpeg_missing: "ffmpeg not found",
	health_ok: "All good",
	health_restart: "Restart needed",
	status_restarting: "Restarting…",
	hw_software: "Software encoding",
	hw_status_desc: "Checked with a short test encode after every change.",
	kv_version: "Version",
	kv_go: "Go runtime",
	kv_platform: "Platform",
	kv_commit: "Commit",
	kv_built: "Built",
	kv_running: "Running",
	kv_bind: "Bind address",
	kv_proxies: "Trusted proxies",
	kv_secret: "Session secret",
	kv_sink: "Log sink",
	kv_status: "Status",
	kv_ffmpeg: "ffmpeg",
	kv_location: "Location",
	kv_last_scan: "Last scan",
	kv_writes: "Writes to",
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
	"library.watch": "Watch folders for changes",
	"library.scan_every": "Full scan every",
	"ffmpeg.enabled": "Read files with ffprobe",
	"log.app.level": "Level",
	"log.app.format": "Format",
	"log.http.format": "Format",
	"log.rotate.max_size": "Rotate at",
	"log.rotate.max_backups": "Files kept",
	"log.rotate.compress": "Compress rotated files",
	"otel.endpoint": "OTLP endpoint",
	"events.retention": "Keep activity events for",
};
const DESCS: Record<string, string> = {
	"events.retention": "2160h is 90 days.",
	"stream.max_live": "Players past this limit wait for a free slot.",
};
const CHOICES: Record<string, string> = {
	auto: "Auto",
	none: "Off",
	vaapi: "VAAPI",
	"1h": "1 h",
	"6h": "6 h",
	"24h": "Day",
	debug: "Debug",
	info: "Info",
	warn: "Warn",
	error: "Error",
	text: "Text",
	json: "JSON",
	combined: "Combined",
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
	freeOf: (a, b) => `${a} free of ${b}`,
	cacheUsed: (s, n) => `${s} used by ${plural(n, "stream")}.`,
	uptime: (n, u) => `up ${n} ${u}`,
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
		server: {
			version: "2.4.1",
			go: "go1.25.3",
			platform: "linux/amd64",
			commit: "b74309c",
			built_at: "2026-10-30T18:12:00Z",
			started_at: "2026-11-08T05:00:00+00:00",
			config_path: "/etc/streamline/config.yaml",
			public_url: "https://streamline.home.arpa",
			https: true,
			bind_address: "0.0.0.0:8080",
			trusted_proxies: ["10.0.0.0/8"],
			session_secret: "/run/secrets/streamline-session",
		},
		storage: {
			media: { free: 4500000000000, total: 8000000000000 },
			data: { path: "/var/lib/streamline", free: 620000000000, total: 1000000000000 },
			database: { path: "/var/lib/streamline/streamline.db", size: 184000000 },
			cache: { path: "/var/cache/streamline", size: 3200000000, streams: 3 },
		},
		health: {
			ffmpeg: { path: "/usr/bin/ffmpeg", version: "7.1" },
			hw: { mode: "vaapi", device: "Intel UHD Graphics 770", ready: true },
			folders: { reachable: 2, total: 2 },
			errors_today: 1,
			errors_source: "scanner",
		},
		logs: { app_path: "/var/log/streamline/app.log", http_path: "/var/log/streamline/http.log" },
	},
	settings: {
		values: {
			"transcoding.hw_accel": "auto",
			"transcoding.hw_device": "/dev/dri/renderD128",
			"stream.tonemap": true,
			"stream.max_live": 2,
			"library.watch": true,
			"library.scan_every": "6h",
			"ffmpeg.enabled": true,
			"log.app.level": "info",
			"log.app.format": "json",
			"log.http.format": "combined",
			"log.rotate.max_size": 50,
			"log.rotate.max_backups": 5,
			"log.rotate.compress": true,
			"otel.endpoint": "",
			"events.retention": "2160h",
		},
		owners: Object.fromEntries(
			Object.keys(LABELS).map((k) => [
				k,
				["transcoding.hw_accel", "transcoding.hw_device", "stream.max_live"].includes(k)
					? "engine"
					: "streamline",
			]),
		),
		read_only: { streamline: false, engine: false },
		pending: [],
		restart_keys: ["log.app.level", "transcoding.hw_accel"],
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
const section = (s: Section[], key: string) => s.find((x) => x.key === key)!;
const rows = (s: Section) => s.blocks.flatMap((b) => b.rows);
const titled = (s: Section, title: string) => s.blocks.find((b) => b.title === title)!;
const kinds = <T extends Row["t"]>(r: Row[], t: T) =>
	r.filter((x): x is Extract<Row, { t: T }> => x.t === t);
const setting = (s: Section[], key: string) =>
	s.flatMap(rows).find((r) => "key" in r && r.key === key) as Extract<Row, { key: string }>;
const hasRestart = (s: Section[]) => JSON.stringify(s).includes('"do":"restart"');

let all = build();
same(
	all.map((s) => s.title),
	["Overview", "Now playing", "Devices", "Transcoding", "Library", "Logs"],
);
same(
	all.map((s) => s.group),
	["", "Streaming", "Streaming", "Streaming", "Library", "System"],
);
eq(section(all, "streams").count, 3);
eq(section(all, "devices").badge, 1);
eq(section(all, "overview").badge, undefined);

const tiles = kinds(rows(section(all, "overview")), "tiles").flatMap((t) => t.tiles);
const tile = (label: string) => tiles.find((t) => t.label === label)!;
eq(tile("Streams").value, "3");
eq(tile("Streams").sub, "1 transcoding · 29.9 Mbps out");
eq(tile("Pairing").value, "1");
eq(tile("Pairing").sub, "iPad mini");
eq(tile("Media storage").value, "44%");
eq(tile("Media storage").sub, "4.5 TB free of 8 TB");
eq(tile("Media storage").pct, 44);
eq(tile("Health").value, "All good");
eq(tile("Health").sub, "ffmpeg 7.1 · VAAPI ready");
eq(tile("Data directory").sub, "620 GB free of 1 TB");
eq(tile("Data directory").pct, 38);
eq(tile("Database").sub, "184 MB · same disk");
eq(tile("Transcode cache").sub, "3.2 GB · 3 streams");
eq(tile("Public URL").mono, true);
eq(tile("Public URL").sub, "Served over HTTPS");

const build_ = titled(section(all, "overview"), "Build & runtime").rows as Extract<
	Row,
	{ t: "kv" }
>[];
same(
	build_.map((r) => [r.label, r.value]),
	[
		["Version", "Streamline Server 2.4.1"],
		["Go runtime", "go1.25.3"],
		["Platform", "linux/amd64"],
		["Commit", "b74309c"],
		["Built", "2026-10-30 18:12 UTC"],
		["Running", "up 31 h"],
	],
);
const old = demo();
old.overview.server.started_at = "2026-11-06T12:00:00Z";
eq(
	(titled(section(build(old), "overview"), "Build & runtime").rows[5] as { value: string }).value,
	"up 3 d",
);
const config = titled(section(all, "overview"), "Set in the config file").rows as Extract<
	Row,
	{ t: "kv" }
>[];
same(
	config.map((r) => r.value),
	["0.0.0.0:8080", "10.0.0.0/8", "/run/secrets/streamline-session", "info / json"],
);

const stream = (s: Section[], id: string) =>
	kinds(rows(section(s, "streams")), "stream").find((r) => r.id === id)!;
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
const quietTile = kinds(rows(section(quietAll, "overview")), "tiles")
	.flatMap((t) => t.tiles)
	.find((t) => t.label === "Streams")!;
eq(quietTile.value, "0");
eq(quietTile.sub, "Nobody is watching");
eq(quietTile.tone, "muted");
same(rows(section(quietAll, "streams")), [
	{ t: "note", tone: "muted", text: "Nobody is watching right now." },
]);

const devices = section(all, "devices");
eq(devices.blocks[0]!.title, "Waiting for approval");
eq(devices.blocks[0]!.desc, EN.blk_waiting_desc);
same(devices.blocks[0]!.rows, [
	{ t: "pair", code: "R4W-X9P", device: "iPad mini", icon: "tablet", sub: "iPadOS · 2 min ago" },
]);
const noPair = demo();
noPair.pairings = [];
eq(section(build(noPair), "devices").blocks[0]!.title, "Paired apps");
eq(section(build(noPair), "devices").badge, undefined);
eq(
	kinds(rows(section(build(noPair), "overview")), "tiles")
		.flatMap((t) => t.tiles)
		.find((t) => t.label === "Pairing")!.sub,
	"No requests waiting",
);

const apps = titled(devices, "Paired apps");
eq(apps.desc, "3 devices, each with its own key in the device’s secure storage.");
const item = (b: { rows: Row[] }, title: string) =>
	kinds(b.rows, "item").find((r) => r.title === title)!;
const pixel = item(apps, "Pixel 9");
eq(pixel.meta, "Android · Camille Roux · Android Keystore");
eq(pixel.aside, "3 days ago");
eq(pixel.icon, "smartphone");
same(pixel.buttons, [
	{ label: "Revoke", act: { do: "revoke", id: "d5" }, tone: "danger", disabled: false },
]);
const bare = demo();
delete bare.devices[2]!.key_store;
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
web.devices[0]!.kind = "browser";
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
	value: "Intel UHD Graphics 770",
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
	kinds(rows(section(softAll, "overview")), "tiles")
		.flatMap((t) => t.tiles)
		.find((t) => t.label === "Health")!.sub,
	"ffmpeg 7.1 · software encoding",
);
for (const patch of [{ ready: false }, { mode: "software" as const }]) {
	const d = demo();
	Object.assign(d.overview.health.hw, patch);
	eq(
		kinds(rows(section(build(d), "overview")), "tiles")
			.flatMap((t) => t.tiles)
			.find((t) => t.label === "Health")!.sub,
		"ffmpeg 7.1 · software encoding",
	);
}
const noName = demo();
delete noName.overview.health.hw.device;
eq(
	(
		titled(section(build(noName), "transcoding"), "Hardware acceleration").rows[2] as {
			value: string;
		}
	).value,
	"VAAPI",
);
eq(setting(all, "stream.max_live").min, 1);
eq(setting(all, "stream.max_live").max, 8);
eq(setting(all, "log.rotate.max_size").unit, "MB");
eq(setting(all, "otel.endpoint").allowEmpty, true);
eq(setting(all, "otel.endpoint").placeholder, "localhost:4318");
eq(setting(all, "events.retention").desc, "2160h is 90 days.");
const cache = titled(tr, "Cache").rows;
eq((cache[1] as { desc: string }).desc, "3.2 GB used by 3 streams.");
const cleared = demo();
cleared.cacheCleared = true;
same(titled(section(build(cleared), "transcoding"), "Cache").rows[1], {
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
scanning.library.folders[0]!.scan = { progress: 0.5, eta_seconds: 8 };
const scanned = item(titled(section(build(scanning), "library"), "Folders"), "Movies");
eq(scanned.buttons[0]!.label, "Scanning…");
eq(scanned.buttons[0]!.disabled, true);
eq(scanned.aside, "50% · 0:08 left");
eq(scanned.progress, 0.5);
eq(item(titled(section(build(scanning), "library"), "Folders"), "Series").progress, undefined);

const lg = section(all, "logs");
same(titled(lg, "Recent").rows, [{ t: "logs" }]);
eq(titled(lg, "Recent").button?.label, "Download");
same(
	(setting(all, "log.app.level").options ?? []).map((o) => o[0]),
	["debug", "info", "warn", "error"],
);
eq(kinds(titled(lg, "Application log").rows, "kv").at(-1)!.value, "/var/log/streamline/app.log");

for (const r of all.flatMap(rows)) if ("restart" in r) eq(r.restart, false);
eq(hasRestart(all), true);
const waiting = demo();
waiting.settings.pending = ["log.app.level", "otel.endpoint"];
const waitAll = build(waiting);
eq(setting(waitAll, "log.app.level").restart, true);
eq(setting(waitAll, "otel.endpoint").restart, true);
eq(setting(waitAll, "log.app.format").restart, false);
const ov = section(waitAll, "overview");
same(ov.blocks[1]!.rows, [
	{
		t: "note",
		tone: "warn",
		text: "2 changes only apply after a restart: log.app.level, otel.endpoint.",
		button: ["Restart now", { do: "restart" }],
	},
]);
const waitHealth = kinds(rows(ov), "tiles")
	.flatMap((t) => t.tiles)
	.find((t) => t.label === "Health")!;
eq(waitHealth.value, "Restart needed");
eq(waitHealth.sub, "2 changes waiting");
eq(waitHealth.tone, "warn");
same(status(waiting, false, words), { label: "Restart needed", tone: "warn" });
same(status(waiting, true, words), { label: "Restarting…", tone: "warn" });
same(status(demo(), false, words), { label: "All good", tone: "ok" });
const one = demo();
one.settings.pending = ["log.app.level"];
eq(
	(section(build(one), "overview").blocks[1]!.rows[0] as { text: string }).text,
	"1 change only applies after a restart: log.app.level.",
);

const locked = demo();
locked.settings.read_only.engine = true;
const lockedAll = build(locked);
for (const key of ["transcoding.hw_accel", "transcoding.hw_device", "stream.max_live"])
	eq(setting(lockedAll, key).locked, true, key);
for (const key of ["stream.tonemap", "log.app.level", "otel.endpoint"])
	eq(setting(lockedAll, key).locked, false, key);
eq(canRestart(locked.settings), true);
eq(hasRestart(lockedAll), true);
locked.settings.read_only.streamline = true;
locked.settings.pending = ["log.app.level"];
const bothAll = build(locked);
for (const r of bothAll.flatMap(rows)) if ("locked" in r) eq(r.locked, true);
eq(canRestart(locked.settings), false);
eq(hasRestart(bothAll), false);

const during = sections(one, find, now, "en", words, true);
const duringNote = section(during, "overview").blocks[1]!.rows[0] as {
	button: [string, unknown];
	disabled?: boolean;
};
same([duringNote.button[0], duringNote.disabled], ["Restarting…", true]);
const duringAct = kinds(rows(section(during, "overview")), "action")[0]!;
same([duringAct.button, duringAct.disabled], ["Restarting…", true]);
const idleAct = kinds(rows(section(build(), "overview")), "action")[0]!;
same([idleAct.button, idleAct.disabled], ["Restart", undefined]);

const approved = demo();
approved.fresh = [approved.devices.find((d) => !d.current && d.kind === "app")!.name];
const freshRows = kinds(rows(section(build(approved), "devices")), "item").filter((r) =>
	r.pills.some((p) => p[0] === "New"),
);
eq(freshRows.length, 1);
eq(freshRows[0]!.pills[0]![1], "ok");

eq(commitNumber("abc", 1, 8), null);
eq(commitNumber("999", 1, 8), 8);
eq(commitNumber("0", 1, 8), 1);
eq(commitNumber("2.6", 1, 8), 3);
eq(commitNumber("", 1, 8), null);
eq(commitText("  ", false), null);
eq(commitText("", true), "");
eq(commitText(" a ", false), "a");

const line = (id: number, level: LogLine["level"]) =>
	({ id, at: "2026-11-09T10:00:00Z", level, source: "x", message: "m" }) as LogLine;
const lines = [line(4, "error"), line(3, "warn"), line(2, "info"), line(1, "debug")];
same(logFilter(lines, "all").length, 4);
same(
	logFilter(lines, "warn").map((l) => l.id),
	[4, 3],
);
same(
	logFilter(lines, "error").map((l) => l.id),
	[4],
);

console.log("server-view-check: ok");
