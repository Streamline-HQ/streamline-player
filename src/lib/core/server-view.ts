import { dateLocale } from "#lib/core/date-locale.ts";
import type {
	AdminDevice,
	AdminLibrary,
	AdminOverview,
	AdminPairing,
	AdminSettings,
	AdminStream,
	Kind,
	LogLevel,
	LogLine,
	SettingValue,
	Title,
} from "#lib/core/types.ts";

export type SectionKey = "overview" | "streams" | "devices" | "transcoding" | "library" | "logs";
export type Tone = "ok" | "warn" | "err" | "accent" | "muted";

export type Act =
	| { do: "go"; to: SectionKey }
	| { do: "stop"; id: string }
	| { do: "approve" | "deny"; code: string }
	| { do: "revoke"; id: string }
	| { do: "end"; id: string }
	| { do: "restart" }
	| { do: "clearcache" }
	| { do: "scan"; folder?: string }
	| { do: "download" };

type Button = { label: string; act: Act; tone: "ghost" | "danger"; disabled: boolean };
type Tile = {
	icon: string;
	label: string;
	value: string;
	sub: string;
	tone: Tone;
	pct?: number;
	mono: boolean;
	go?: SectionKey;
};

export type Row =
	| {
			t: "toggle" | "choice" | "text" | "num";
			key: string;
			label: string;
			desc?: string;
			value: SettingValue;
			options?: [string, string][];
			placeholder?: string;
			min?: number;
			max?: number;
			unit?: string;
			allowEmpty?: boolean;
			disabled: boolean;
			locked: boolean;
			restart: boolean;
	  }
	| { t: "kv"; label: string; value: string; desc?: string; pill?: [string, Tone] }
	| { t: "action"; label: string; desc: string; button: string; act: Act; tone: "ghost" | "danger" }
	| {
			t: "item";
			icon: string;
			title: string;
			meta: string;
			pills: [string, Tone][];
			buttons: Button[];
			aside?: string;
			asideTone?: Tone;
			progress?: number;
	  }
	| {
			t: "stream";
			id: string;
			poster: Title | null;
			kind: Kind;
			title: string;
			sub: string;
			user: string;
			short: string;
			device: string;
			where: string;
			pct: number;
			time: string;
			mode: string;
			tone: Tone;
			path: string;
			mbps: string;
			playing: boolean;
	  }
	| { t: "pair"; code: string; device: string; icon: string; sub: string }
	| { t: "note"; tone: Tone; text: string; button?: [string, Act] }
	| { t: "tiles"; tiles: Tile[] }
	| { t: "logs" };

export type Block = {
	cap?: string;
	title?: string;
	desc?: string;
	button?: { label: string; icon: string; act: Act };
	bare: boolean;
	danger: boolean;
	rows: Row[];
};

export type Section = {
	key: SectionKey;
	group: string;
	title: string;
	icon: string;
	intro: string;
	count?: number;
	badge?: number;
	blocks: Block[];
};

export type AdminData = {
	overview: AdminOverview;
	settings: AdminSettings;
	streams: AdminStream[];
	pairings: AdminPairing[];
	devices: AdminDevice[];
	library: AdminLibrary;
	cacheCleared: boolean;
	web: boolean;
	/** Seconds since the streams were last fetched. */
	tick: number;
};

type Section_ = `sec_${SectionKey}` | `sec_${SectionKey}_intro`;
export type TextId =
	| Section_
	| "group_streaming"
	| "group_library"
	| "group_system"
	| "cap_now"
	| "cap_engine"
	| "blk_build"
	| "blk_config"
	| "blk_config_desc"
	| "blk_telemetry"
	| "blk_restart"
	| "blk_waiting"
	| "blk_waiting_desc"
	| "blk_apps"
	| "blk_browsers"
	| "blk_browsers_desc"
	| "blk_hw"
	| "blk_live"
	| "blk_cache"
	| "blk_cache_desc"
	| "blk_folders"
	| "blk_scanning"
	| "blk_recent"
	| "blk_applog"
	| "blk_accesslog"
	| "blk_rotation"
	| "act_restart_title"
	| "act_restart_desc"
	| "act_restart"
	| "act_cache_title"
	| "act_clear"
	| "btn_restart_now"
	| "btn_scan_all"
	| "btn_scan"
	| "btn_scanning"
	| "btn_download"
	| "btn_revoke"
	| "btn_end"
	| "tile_streams"
	| "tile_pairing"
	| "tile_storage"
	| "tile_health"
	| "tile_url"
	| "tile_data"
	| "tile_db"
	| "tile_cache"
	| "tile_nobody"
	| "tile_no_requests"
	| "tile_https"
	| "tile_http"
	| "tile_same_disk"
	| "tile_empty"
	| "tile_ffmpeg_missing"
	| "health_ok"
	| "health_restart"
	| "status_restarting"
	| "hw_software"
	| "hw_status_desc"
	| "kv_version"
	| "kv_go"
	| "kv_platform"
	| "kv_commit"
	| "kv_built"
	| "kv_running"
	| "kv_bind"
	| "kv_proxies"
	| "kv_secret"
	| "kv_sink"
	| "kv_status"
	| "kv_ffmpeg"
	| "kv_location"
	| "kv_last_scan"
	| "kv_writes"
	| "pill_off"
	| "pill_ready"
	| "pill_not_ready"
	| "pill_found"
	| "pill_not_found"
	| "pill_this_device"
	| "pill_this_browser"
	| "note_nobody"
	| "note_no_apps"
	| "note_no_browsers"
	| "note_cache_cleared"
	| "mode_copy"
	| "mode_audio"
	| "mode_transcode"
	| "net_home"
	| "net_remote"
	| "sent_as_is"
	| "video_as_is"
	| "kind_browser"
	| "kind_tablet"
	| "kind_phone"
	| "kind_tv"
	| "kind_desktop"
	| "aside_streaming"
	| "ago_now"
	| "ago_yesterday"
	| "vaapi";

export type Unit = "B" | "KB" | "MB" | "GB" | "TB";

/** Every sentence the screen shows, worded by the caller: `core` stays free of the message catalogue. */
export type Words = {
	t(id: TextId): string;
	label(key: string): string;
	desc(key: string): string | undefined;
	choice(key: string, value: string): string;
	size(n: string, unit: Unit): string;
	streamCount(n: number): string;
	appsDesc(n: number): string;
	changeCount(n: number): string;
	changesWaiting(n: number): string;
	restartNote(n: number, keys: string): string;
	streamSummary(transcoding: number, mbps: string): string;
	mbps(n: string): string;
	you(name: string): string;
	cannotDecode(kind: string, codec: string): string;
	realtime(speed: string): string;
	runtime(min: number): string;
	healthSub(ffmpeg: string, software: boolean): string;
	freeOf(free: string, total: string): string;
	cacheUsed(size: string, streams: number): string;
	uptime(n: number, unit: "h" | "d"): string;
	minutesAgo(n: number): string;
	hoursAgo(n: number): string;
	daysAgo(n: number): string;
	expiresIn(days: number): string;
	folderCount(kind: Kind, n: number): string;
	scanProgress(pct: number, left: string): string;
	lastScan(when: string, added: number, replaced: number, errors: number): string;
};

type Find = (kind: Kind, id: number) => Title | undefined;

const dayIndex = (d: Date) =>
	Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);

const pad = (n: number) => String(n).padStart(2, "0");

export function clock(seconds: number) {
	const s = Math.max(0, Math.floor(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Decimal units, one decimal at most: "4.5 TB", "184 MB". */
export function sizeText(bytes: number, locale: string, w: Words) {
	const units: Unit[] = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let i = 0;
	while (value >= 1000 && i < units.length - 1) {
		value /= 1000;
		i++;
	}
	return w.size(value.toLocaleString(locale, { maximumFractionDigits: 1 }), units[i]!);
}

export function ago(iso: string, now: Date, w: Words) {
	const at = new Date(iso);
	const seconds = (now.getTime() - at.getTime()) / 1000;
	if (seconds < 60) return w.t("ago_now");
	if (seconds < 3600) return w.minutesAgo(Math.floor(seconds / 60));
	const days = dayIndex(now) - dayIndex(at);
	if (days <= 0) return w.hoursAgo(Math.floor(seconds / 3600));
	if (days === 1) return w.t("ago_yesterday");
	return w.daysAgo(days);
}

export function uptime(startedAt: string, now: Date, w: Words) {
	const hours = Math.max(0, Math.floor((now.getTime() - Date.parse(startedAt)) / 3.6e6));
	return hours < 48 ? w.uptime(hours, "h") : w.uptime(Math.floor(hours / 24), "d");
}

const builtText = (iso: string) => {
	const d = new Date(iso);
	return Number.isNaN(d.getTime())
		? iso
		: `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
};

const deviceIcon = (platform: string, name: string, browser: boolean) => {
	const p = platform.toLowerCase();
	if (browser) return "globe";
	if (p.includes("tv")) return "tv";
	if (p.includes("ipad") || /\b(tab|ipad)/i.test(name)) return "tablet";
	if (p.includes("ios") || p.includes("android")) return "smartphone";
	return "monitor";
};

export const canRestart = (s: AdminSettings) => !(s.read_only.streamline && s.read_only.engine);

export function commitNumber(raw: string, min: number, max: number): number | null {
	const text = raw.trim();
	if (text === "") return null;
	const n = Number(text);
	if (!Number.isFinite(n)) return null;
	return Math.min(max, Math.max(min, Math.round(n)));
}

export function commitText(raw: string, allowEmpty: boolean): string | null {
	const text = raw.trim();
	return text === "" && !allowEmpty ? null : text;
}

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function logFilter(lines: LogLine[], level: "all" | "warn" | "error") {
	if (level === "all") return lines;
	const floor = level === "warn" ? RANK.warn : RANK.error;
	return lines.filter((l) => RANK[l.level] >= floor);
}

export function status(d: AdminData, restarting: boolean, w: Words): { label: string; tone: Tone } {
	if (restarting) return { label: w.t("status_restarting"), tone: "warn" };
	if (d.settings.pending.length) return { label: w.t("health_restart"), tone: "warn" };
	return { label: w.t("health_ok"), tone: "ok" };
}

const KIND_TEXT = {
	browser: "kind_browser",
	tablet: "kind_tablet",
	phone: "kind_phone",
	tv: "kind_tv",
	desktop: "kind_desktop",
} as const;

export function sections(d: AdminData, find: Find, now: Date, locale: string, w: Words): Section[] {
	const s = d.settings;
	const v = (key: string) => s.values[key];
	const hwOff = v("transcoding.hw_accel") === "none";
	const pending = s.pending;
	const restartOn = pending.length > 0;
	const restartable = canRestart(s);
	const o = d.overview;
	const size = (n: number) => sizeText(n, locale, w);
	const lang = dateLocale(locale);

	const restartAct: Act = { do: "restart" };
	const kv = (label: string, value: string, extra: { pill?: [string, Tone]; desc?: string } = {}) =>
		({ t: "kv", label, value, ...extra }) as const;
	const note = (tone: Tone, text: string, button?: [string, Act]) =>
		({ t: "note", tone, text, ...(button ? { button } : {}) }) as const;
	const block = (b: Partial<Block> & { rows: Row[] }): Block => ({
		bare: false,
		danger: false,
		...b,
	});

	const setting = (
		t: "toggle" | "choice" | "text" | "num",
		key: string,
		extra: {
			options?: string[];
			placeholder?: string;
			min?: number;
			max?: number;
			unit?: string;
			allowEmpty?: boolean;
			disabled?: boolean;
		} = {},
	): Row => {
		const desc = w.desc(key);
		const { options, disabled, ...rest } = extra;
		return {
			t,
			key,
			label: w.label(key),
			...(desc ? { desc } : {}),
			value: v(key) ?? (t === "toggle" ? false : t === "num" ? (extra.min ?? 0) : ""),
			...(options ? { options: options.map((o): [string, string] => [o, w.choice(key, o)]) } : {}),
			...rest,
			disabled: disabled ?? false,
			locked: !!s.read_only[s.owners[key] ?? "streamline"],
			restart: pending.includes(key),
		};
	};

	const restartNote = restartOn
		? [
				note(
					"warn",
					w.restartNote(pending.length, pending.join(", ")),
					restartable ? [w.t("btn_restart_now"), restartAct] : undefined,
				),
			]
		: [];

	const nTrans = d.streams.filter((x) => x.mode === "transcode").length;
	const mbps = (d.streams.reduce((a, x) => a + x.bitrate, 0) / 1e6).toFixed(1);
	const streamSum = d.streams.length ? w.streamSummary(nTrans, w.mbps(mbps)) : w.t("tile_nobody");

	const streamRows: Row[] = d.streams.map((x) => {
		const title = find(x.title.kind, x.title.id) ?? null;
		const ep =
			x.season !== undefined && x.episode !== undefined
				? title?.seasons
						?.find((n) => n.number === x.season)
						?.episodes.find((e) => e.number === x.episode)
				: undefined;
		const at = Math.min(x.duration, x.position + (x.playing ? d.tick : 0));
		const [mode, tone]: [string, Tone] = {
			copy: [w.t("mode_copy"), "ok"] as [string, Tone],
			audio: [w.t("mode_audio"), "accent"] as [string, Tone],
			transcode: [w.t("mode_transcode"), "warn"] as [string, Tone],
		}[x.mode];
		const reason = x.cannot_decode
			? w.cannotDecode(w.t(KIND_TEXT[x.device.kind]), x.cannot_decode)
			: "";
		const path = (
			x.mode === "copy"
				? [x.video, x.audio, w.t("sent_as_is")]
				: x.mode === "audio"
					? [`${x.from} → ${x.to}`, w.t("video_as_is"), reason]
					: [
							`${x.from} → ${x.to}`,
							x.hw,
							x.speed === undefined
								? ""
								: w.realtime(x.speed.toLocaleString(locale, { maximumFractionDigits: 1 })),
							reason,
						]
		)
			.filter(Boolean)
			.join(" · ");
		return {
			t: "stream",
			id: x.id,
			poster: title,
			kind: x.title.kind,
			title: title?.title ?? "—",
			sub: ep
				? `S${x.season} E${x.episode} · ${ep.title}`
				: x.season !== undefined
					? `S${x.season} E${x.episode}`
					: title
						? [title.year, w.runtime(title.runtime ?? 0)].join(" · ")
						: "",
			user: x.user.you ? w.you(x.user.name) : x.user.name,
			short: x.user.name.split(" ")[0] ?? x.user.name,
			device: x.device.name,
			where: w.t(x.network === "home" ? "net_home" : "net_remote"),
			pct: x.duration > 0 ? (at / x.duration) * 100 : 0,
			time: `${clock(at)} / ${clock(x.duration)}`,
			mode,
			tone,
			path,
			mbps: w.mbps((x.bitrate / 1e6).toFixed(1)),
			playing: x.playing,
		};
	});

	const apps = d.devices.filter((x) => x.kind === "app");
	const browsers = d.devices.filter((x) => x.kind === "browser");
	const first = d.pairings[0];
	const hw = o.health.hw;
	const ffmpeg = o.health.ffmpeg;
	const used = (m: { free: number; total: number }) =>
		m.total > 0 ? Math.round(((m.total - m.free) / m.total) * 100) : 0;
	const sameDisk = o.storage.database.path.startsWith(o.storage.data.path);

	const tile = (t: Omit<Tile, "mono"> & { mono?: boolean }): Tile => ({ mono: false, ...t });

	const tilesNow: Block = block({
		bare: true,
		cap: w.t("cap_now"),
		rows: [
			{
				t: "tiles",
				tiles: [
					tile({
						icon: "circle-play",
						label: w.t("tile_streams"),
						value: String(d.streams.length),
						sub: streamSum,
						go: "streams",
						tone: d.streams.length ? "accent" : "muted",
					}),
					tile({
						icon: "monitor-smartphone",
						label: w.t("tile_pairing"),
						value: String(d.pairings.length),
						sub: first ? first.name : w.t("tile_no_requests"),
						go: "devices",
						tone: first ? "accent" : "muted",
					}),
					tile({
						icon: "hard-drive",
						label: w.t("tile_storage"),
						value: `${used(o.storage.media)}%`,
						pct: used(o.storage.media),
						sub: w.freeOf(size(o.storage.media.free), size(o.storage.media.total)),
						go: "library",
						tone: "ok",
					}),
					restartOn
						? tile({
								icon: "triangle-alert",
								label: w.t("tile_health"),
								value: w.t("health_restart"),
								sub: w.changesWaiting(pending.length),
								go: "overview",
								tone: "warn",
							})
						: tile({
								icon: "circle-check",
								label: w.t("tile_health"),
								value: w.t("health_ok"),
								sub: ffmpeg
									? w.healthSub(
											ffmpeg.version,
											hwOff || !o.health.hw.ready || o.health.hw.mode === "software",
										)
									: w.t("tile_ffmpeg_missing"),
								go: "logs",
								tone: ffmpeg ? "ok" : "warn",
							}),
				],
			},
		],
	});

	const cacheEmpty = d.cacheCleared;
	const engineTiles: Block = block({
		bare: true,
		cap: w.t("cap_engine"),
		rows: [
			{
				t: "tiles",
				tiles: [
					tile({
						icon: "globe",
						label: w.t("tile_url"),
						value: o.server.public_url,
						mono: true,
						sub: w.t(o.server.https ? "tile_https" : "tile_http"),
						tone: o.server.https ? "ok" : "warn",
					}),
					tile({
						icon: "folder",
						label: w.t("tile_data"),
						value: o.storage.data.path,
						mono: true,
						pct: used(o.storage.data),
						sub: w.freeOf(size(o.storage.data.free), size(o.storage.data.total)),
						tone: "ok",
					}),
					tile({
						icon: "layers",
						label: w.t("tile_db"),
						value: o.storage.database.path,
						mono: true,
						sub: sameDisk
							? `${size(o.storage.database.size)} · ${w.t("tile_same_disk")}`
							: size(o.storage.database.size),
						tone: "ok",
					}),
					tile({
						icon: "cpu",
						label: w.t("tile_cache"),
						value: o.storage.cache.path,
						mono: true,
						sub: cacheEmpty
							? w.t("tile_empty")
							: `${size(o.storage.cache.size)} · ${w.streamCount(o.storage.cache.streams)}`,
						tone: "ok",
					}),
				],
			},
		],
	});

	const overview: Section = {
		key: "overview",
		group: "",
		title: w.t("sec_overview"),
		icon: "server",
		intro: w.t("sec_overview_intro"),
		blocks: [
			tilesNow,
			...(restartOn ? [block({ rows: restartNote })] : []),
			engineTiles,
			block({
				title: w.t("blk_build"),
				rows: [
					kv(w.t("kv_version"), `Streamline Server ${o.server.version}`),
					kv(w.t("kv_go"), o.server.go),
					kv(w.t("kv_platform"), o.server.platform),
					kv(w.t("kv_commit"), o.server.commit),
					kv(w.t("kv_built"), builtText(o.server.built_at)),
					kv(w.t("kv_running"), uptime(o.server.started_at, now, w)),
				],
			}),
			block({
				title: w.t("blk_config"),
				desc: w.t("blk_config_desc"),
				rows: [
					kv(w.t("kv_bind"), o.server.bind_address),
					kv(w.t("kv_proxies"), o.server.trusted_proxies.join(", ")),
					kv(w.t("kv_secret"), o.server.session_secret),
					kv(w.t("kv_sink"), `${v("log.app.level")} / ${v("log.app.format")}`),
				],
			}),
			block({
				title: w.t("blk_telemetry"),
				rows: [
					setting("text", "otel.endpoint", { placeholder: "localhost:4318", allowEmpty: true }),
					setting("text", "events.retention", { placeholder: "2160h" }),
				],
			}),
			...(restartable
				? [
						block({
							title: w.t("blk_restart"),
							danger: true,
							rows: [
								{
									t: "action",
									label: w.t("act_restart_title"),
									desc: w.t("act_restart_desc"),
									button: w.t("act_restart"),
									act: restartAct,
									tone: "danger",
								},
							],
						}),
					]
				: []),
		],
	};

	const streams: Section = {
		key: "streams",
		group: w.t("group_streaming"),
		title: w.t("sec_streams"),
		icon: "circle-play",
		intro: w.t("sec_streams_intro"),
		count: d.streams.length,
		blocks: [
			block({
				title: w.streamCount(d.streams.length),
				desc: streamSum,
				rows: streamRows.length ? streamRows : [note("muted", w.t("note_nobody"))],
			}),
		],
	};

	const device = (x: AdminDevice, browser: boolean): Row => {
		const own = x.current;
		const meta = browser
			? [
					x.user.name,
					x.expires_at
						? w.expiresIn(
								Math.max(1, Math.round((Date.parse(x.expires_at) - now.getTime()) / 864e5)),
							)
						: "",
				]
			: [x.platform, x.user.name, x.key_store ?? ""];
		return {
			t: "item",
			icon: deviceIcon(x.platform, x.name, browser),
			title: x.name,
			meta: meta.filter(Boolean).join(" · "),
			pills: own ? [[w.t(d.web ? "pill_this_browser" : "pill_this_device"), "accent"]] : [],
			buttons: own
				? []
				: [
						{
							label: w.t(browser ? "btn_end" : "btn_revoke"),
							act: { do: browser ? "end" : "revoke", id: x.id },
							tone: "danger",
							disabled: false,
						},
					],
			aside: x.streaming ? w.t("aside_streaming") : own ? w.t("ago_now") : ago(x.last_seen, now, w),
			...(x.streaming || own ? { asideTone: "ok" as Tone } : {}),
		};
	};

	const devices: Section = {
		key: "devices",
		group: w.t("group_streaming"),
		title: w.t("sec_devices"),
		icon: "monitor-smartphone",
		intro: w.t("sec_devices_intro"),
		count: apps.length,
		...(d.pairings.length ? { badge: d.pairings.length } : {}),
		blocks: [
			...(d.pairings.length
				? [
						block({
							title: w.t("blk_waiting"),
							desc: w.t("blk_waiting_desc"),
							rows: d.pairings.map(
								(p): Row => ({
									t: "pair",
									code: p.user_code,
									device: p.name,
									icon: deviceIcon(p.platform, p.name, false),
									sub: `${p.platform} · ${ago(p.created_at, now, w)}`,
								}),
							),
						}),
					]
				: []),
			block({
				title: w.t("blk_apps"),
				desc: w.appsDesc(apps.length),
				rows: apps.length
					? apps.map((x) => device(x, false))
					: [note("muted", w.t("note_no_apps"))],
			}),
			block({
				title: w.t("blk_browsers"),
				desc: w.t("blk_browsers_desc"),
				rows: browsers.length
					? browsers.map((x) => device(x, true))
					: [note("muted", w.t("note_no_browsers"))],
			}),
		],
	};

	const hwReady = hw.ready;
	const transcoding: Section = {
		key: "transcoding",
		group: w.t("group_streaming"),
		title: w.t("sec_transcoding"),
		icon: "cpu",
		intro: w.t("sec_transcoding_intro"),
		blocks: [
			block({
				title: w.t("blk_hw"),
				rows: [
					setting("choice", "transcoding.hw_accel", { options: ["auto", "none", "vaapi"] }),
					setting("text", "transcoding.hw_device", {
						placeholder: "/dev/dri/renderD128",
						disabled: hwOff,
					}),
					kv(w.t("kv_status"), hwOff ? w.t("hw_software") : (hw.device ?? w.t("vaapi")), {
						pill: hwOff
							? [w.t("pill_off"), "muted"]
							: hwReady
								? [w.t("pill_ready"), "ok"]
								: [w.t("pill_not_ready"), "warn"],
						desc: w.t("hw_status_desc"),
					}),
				],
			}),
			block({
				title: w.t("blk_live"),
				rows: [
					setting("toggle", "stream.tonemap"),
					setting("num", "stream.max_live", { min: 1, max: 8 }),
					kv(w.t("kv_ffmpeg"), ffmpeg ? `${ffmpeg.path} · ${ffmpeg.version}` : "—", {
						pill: ffmpeg ? [w.t("pill_found"), "ok"] : [w.t("pill_not_found"), "err"],
					}),
				],
			}),
			block({
				title: w.t("blk_cache"),
				desc: w.t("blk_cache_desc"),
				rows: [
					kv(w.t("kv_location"), o.storage.cache.path),
					d.cacheCleared
						? note("ok", w.t("note_cache_cleared"))
						: {
								t: "action",
								label: w.t("act_cache_title"),
								desc: w.cacheUsed(size(o.storage.cache.size), o.storage.cache.streams),
								button: w.t("act_clear"),
								act: { do: "clearcache" },
								tone: "ghost",
							},
				],
			}),
		],
	};

	const folderRow = (f: AdminLibrary["folders"][number]): Row => {
		const aside = `${w.folderCount(f.kind, f.count)} · ${size(f.size)}`;
		if (!f.scan)
			return {
				t: "item",
				icon: "folder",
				title: f.name,
				meta: f.path,
				pills: [],
				buttons: [
					{
						label: w.t("btn_scan"),
						act: { do: "scan", folder: f.id },
						tone: "ghost",
						disabled: false,
					},
				],
				aside,
			};
		const left = Math.max(0, Math.ceil(f.scan.eta_seconds));
		return {
			t: "item",
			icon: "folder",
			title: f.name,
			meta: f.path,
			pills: [],
			buttons: [
				{
					label: w.t("btn_scanning"),
					act: { do: "scan", folder: f.id },
					tone: "ghost",
					disabled: true,
				},
			],
			aside: w.scanProgress(Math.round(f.scan.progress * 100), clock(left)),
			progress: f.scan.progress,
		};
	};
	const last = d.library.last_scan;
	const lastWhen = last
		? (() => {
				const at = new Date(last.at);
				return `${at.toLocaleDateString(lang, { weekday: "short" })} ${at.toLocaleTimeString(lang, {
					hour: "2-digit",
					minute: "2-digit",
					hourCycle: "h23",
				})}`;
			})()
		: "";

	const library: Section = {
		key: "library",
		group: w.t("group_library"),
		title: w.t("sec_library"),
		icon: "folder",
		intro: w.t("sec_library_intro"),
		blocks: [
			block({
				title: w.t("blk_folders"),
				button: { label: w.t("btn_scan_all"), icon: "refresh-cw", act: { do: "scan" } },
				rows: [
					...d.library.folders.map(folderRow),
					...(last
						? [
								kv(
									w.t("kv_last_scan"),
									w.lastScan(lastWhen, last.added, last.replaced, last.errors),
								),
							]
						: []),
				],
			}),
			block({
				title: w.t("blk_scanning"),
				rows: [
					setting("toggle", "library.watch"),
					setting("choice", "library.scan_every", { options: ["1h", "6h", "24h"] }),
					setting("toggle", "ffmpeg.enabled"),
				],
			}),
		],
	};

	const logs: Section = {
		key: "logs",
		group: w.t("group_system"),
		title: w.t("sec_logs"),
		icon: "text",
		intro: w.t("sec_logs_intro"),
		blocks: [
			block({
				title: w.t("blk_recent"),
				button: { label: w.t("btn_download"), icon: "download", act: { do: "download" } },
				rows: [{ t: "logs" }],
			}),
			block({
				title: w.t("blk_applog"),
				rows: [
					setting("choice", "log.app.level", { options: ["debug", "info", "warn", "error"] }),
					setting("choice", "log.app.format", { options: ["text", "json"] }),
					kv(w.t("kv_writes"), o.logs.app_path),
				],
			}),
			block({
				title: w.t("blk_accesslog"),
				rows: [
					setting("choice", "log.http.format", { options: ["json", "combined"] }),
					kv(w.t("kv_writes"), o.logs.http_path),
				],
			}),
			block({
				title: w.t("blk_rotation"),
				rows: [
					setting("num", "log.rotate.max_size", { min: 1, max: 1024, unit: "MB" }),
					setting("num", "log.rotate.max_backups", { min: 0, max: 100 }),
					setting("toggle", "log.rotate.compress"),
				],
			}),
		],
	};

	return [overview, streams, devices, transcoding, library, logs];
}

export function logTime(iso: string, locale: string) {
	return new Date(iso).toLocaleTimeString(dateLocale(locale), {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	});
}
