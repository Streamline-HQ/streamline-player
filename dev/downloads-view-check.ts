// node dev/downloads-view-check.ts
import { strictEqual as eq, deepStrictEqual as same, ok } from "node:assert";
import { audioRate, converts, estimate, sizeText } from "../src/lib/core/download-size.ts";
import {
	bulkState,
	buttonState,
	keyOf,
	pageView,
	pickDefaults,
	pickView,
	popoverView,
	rateText,
	storageView,
	type Words,
} from "../src/lib/core/downloads-view.ts";
import { language } from "../src/lib/core/playback/rules.ts";
import type { AudioTrack, SubTrack, Tracks } from "../src/lib/core/playback/port.ts";
import type { DownloadEntry } from "../src/lib/core/types.ts";

const clock = (s: number) => {
	const m = Math.floor(s / 60);
	return m >= 60
		? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
		: `${m}:${String(s % 60).padStart(2, "0")}`;
};
const w: Words = {
	language,
	quality: (q) => (q === "original" ? "Original" : q),
	runtime: (m) =>
		m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`,
	clock,
	audioName: (t) =>
		`${{ truehd: "TrueHD", eac3: "EAC3", aac: "AAC" }[t.codec] ?? t.codec} ${t.channels >= 3 ? `${t.channels - 1}.1` : `${t.channels}.0`}`,
	subName: (t) => language(t.language),
	subKind: (t) => (/pgs/.test(t.codec) ? "Image (PGS)" : "Text (SRT)"),
	videoName: (v) => `${v.height}p ${v.codec}`,
	summary: (n, m) => `${n} ready · ${m} in progress`,
	movies: "Movies",
	episodes: (n) => `${n} episode${n > 1 ? "s" : ""}`,
	season: (n, e, s) => `Season ${n} · ${e} · ${s}`,
	starting: "Starting…",
	preparing: (n) => `Preparing on the server · ${n}%`,
	queued: (n) => `Queued · #${n}`,
	waiting: "Waiting for the server",
	queuedShort: "Queued",
	cause: (c) =>
		({
			prepare_failed: "The server couldn’t prepare it",
			no_space: "Not enough space on this computer",
			gone: "No longer on the server",
		})[c],
	kept: (s) => `${s} kept`,
	perSecond: (x, eta) => `${x} MB/s · ${eta} left`,
	seconds: (n) => `${n} s`,
	minutes: (n) => `${n} min`,
	hoursMinutes: (h, m) => `${h} h ${m} min`,
	watched: "watched",
	tracks: (a, s) => `Audio: ${a} · Subtitles: ${s}`,
	none: "none",
	finishedOffline: "Finished offline · syncs when you’re back online",
	watchedTo: (t) => `Watched to ${t} offline · syncs when you’re back online`,
	meterUsed: (s) => `${s} Streamline`,
	meterOther: (s) => `${s} other`,
	meterFree: (s) => `${s} free`,
	download: (l) => `Download ${l}`,
	downloadShort: "Download",
	removeDownload: (l) => `Remove download of ${l}`,
	onDevice: "On device",
	cancelDownload: (l) => `Cancel download of ${l}`,
	seasonOnDevice: "Season on device",
	seriesOnDevice: "Series on device",
	downloadSeason: "Download season",
	downloadSeries: "Download series",
	downloadMore: (n) => `Download ${n} more`,
	downloadingName: (n, p) => `Downloading ${n} · ${p}%`,
	removeFromDevice: (n) => `Remove ${n} from this device`,
	downloadNameEpisodes: (n, c) => `Download ${n} · ${c} episode${c > 1 ? "s" : ""}`,
	pickTitle: (l) => `Download ${l}`,
	noteOriginal: (v) => `The file as it is on the server: ${v}. Nothing is converted.`,
	noteConverted: (q, many) =>
		`The server converts ${many ? "them" : "it"} to ${q} first, so the download takes longer to start.`,
	originalSuffix: " · original",
	cantShow: "can’t be shown here",
};

type Spec = {
	id: number;
	title: string;
	season?: number;
	episode?: number;
	size?: number;
	state?: DownloadEntry["state"];
	progress?: number;
	bytes?: number;
	quality?: DownloadEntry["quality"];
	watched?: boolean;
	offline?: DownloadEntry["offline"];
	error?: DownloadEntry["error"];
	langs?: string[];
	year?: number;
};
const make = (s: Spec): DownloadEntry => {
	const series = s.season !== undefined;
	const size = s.size ?? 1.8e9;
	const state = s.state ?? "done";
	const progress = s.progress ?? (state === "done" ? 1 : 0);
	return {
		key: keyOf(series ? "series" : "movies", s.id, s.season, s.episode),
		media_id: `m${s.id}${s.season ?? ""}${s.episode ?? ""}`,
		quality: s.quality ?? "1080p",
		audio: (s.langs ?? ["en"]).map((language, index) => ({
			index,
			language,
			codec: "eac3",
			converted: false,
		})),
		subtitles: [],
		state,
		progress,
		bytes: s.bytes ?? (state === "done" ? size : Math.round(size * progress)),
		size,
		error: s.error ?? null,
		added_at: "2026-11-12T10:00:00Z",
		meta: {
			kind: series ? "series" : "movies",
			title_id: s.id,
			title: s.title,
			year: series ? null : (s.year ?? 2021),
			runtime: series ? 48 : 148,
			season: s.season ?? null,
			episode: s.episode ?? null,
			episode_title: series ? `Episode ${s.episode}` : null,
			poster: `/poster/${s.id}`,
			still: `/still/${s.id}/${s.episode ?? 0}`,
		},
		watched: s.watched ?? false,
		offline: s.offline ?? null,
	};
};

const sample: DownloadEntry[] = [
	make({ id: 1, title: "Severance", season: 1, episode: 1, size: 1.8e9 }),
	make({ id: 1, title: "Severance", season: 1, episode: 2, size: 1.5e9, watched: true }),
	make({ id: 1, title: "Severance", season: 2, episode: 1, size: 1.7e9 }),
	make({ id: 1, title: "Severance", season: 2, episode: 2, size: 1.8e9 }),
	make({ id: 1, title: "Severance", season: 2, episode: 3, size: 1.7e9 }),
	make({
		id: 1,
		title: "Severance",
		season: 2,
		episode: 4,
		size: 1.6e9,
		state: "downloading",
		progress: 0.46,
	}),
	make({
		id: 2,
		title: "Arcane",
		season: 2,
		episode: 3,
		size: 1.1e9,
		state: "queued",
		quality: "720p",
	}),
	make({ id: 3, title: "Shōgun", season: 1, episode: 1 }),
	make({ id: 3, title: "Shōgun", season: 1, episode: 2 }),
	make({
		id: 3,
		title: "Shōgun",
		season: 1,
		episode: 3,
		offline: { position: 2040, done: false, at: "x" },
	}),
	make({ id: 4, title: "The Last of Us", season: 1, episode: 3 }),
	make({
		id: 4,
		title: "The Last of Us",
		season: 2,
		episode: 1,
		offline: { position: 0, done: true, at: "x" },
	}),
	make({ id: 5, title: "Dune", size: 4.2e9, langs: ["en", "en"] }),
];

const page = pageView(sample, 5_000_000, w);
eq(page.summary, "11 ready · 2 in progress");
eq(page.empty, false);
eq(page.active[0]!.title, "Severance · S2 E4");
eq(page.active[0]!.pct, 46);
eq(page.active[0]!.sub, "1080p · 0.74 of 1.6 GB");
eq(page.active[0]!.state, "downloading");
eq(page.active[0]!.noteTone, "rate");
ok(/^\d+(\.\d)? MB\/s · .+ left$/.test(page.active[0]!.note), page.active[0]!.note);
eq(page.active[1]!.note, "Queued · #1");
eq(page.active[1]!.state, "queued");
eq(page.active[1]!.sub, "720p · 0.00 of 1.1 GB");
eq(pageView(sample, 0, w).active[0]!.note, "Starting…");
eq(pageView(sample, 0, w).active[0]!.state, "starting");

const one = (s: Spec) => pageView([make(s)], 0, w).active[0]!;
const prep = one({ id: 9, title: "X", state: "preparing", progress: 0.42 });
eq(prep.note, "Preparing on the server · 42%");
eq(prep.state, "preparing");
eq(one({ id: 9, title: "X", state: "waiting", progress: 0.1 }).note, "Waiting for the server");
const bad = one({ id: 9, title: "X", state: "failed", progress: 0.3, error: "no_space" });
eq(bad.noteTone, "failed");
eq(bad.note, "Not enough space on this computer");
eq(bad.canRetry, true);
eq(bad.state, "failed");

const g = page.groups;
eq(g.length, 4);
eq(g[0]!.kind, "movies");
eq(g[0]!.sub, "1 · 4.2 GB");
same(
	g.slice(1).map((x) => x.title),
	["Severance", "Shōgun", "The Last of Us"],
);
eq(g[1]!.sub, "5 episodes · 8.5 GB");
same(
	g[1]!.seasons.map((s) => s.label),
	["Season 1 · 2 episodes · 3.3 GB", "Season 2 · 3 episodes · 5.2 GB"],
);
eq(g[1]!.firstSeason, 1);
eq(g[1]!.titleId, 1);
eq(g[1]!.titleKind, "series");
eq(g[1]!.keys.length, 5);
eq(g[1]!.seasons[0]!.cards[0]!.head, "E1 · Episode 1");
eq(g[1]!.seasons[0]!.cards[0]!.line, "48 min");
eq(g[1]!.seasons[0]!.cards[0]!.meta, "1080p · 1.8 GB");
eq(g[1]!.seasons[0]!.cards[1]!.meta, "1080p · 1.5 GB · watched");
eq(g[3]!.seasons[0]!.label, "Season 1 · 1 episode · 1.8 GB");
eq(g[0]!.seasons[0]!.label, null);
eq(g[0]!.seasons[0]!.cards[0]!.line, "2021 · 2 h 28 min");

eq(g[0]!.seasons[0]!.cards[0]!.tracks, "Audio: English · Subtitles: none");
eq(g[1]!.seasons[0]!.cards[0]!.tracks, "Audio: English · Subtitles: none");

eq(g[2]!.seasons[0]!.cards[2]!.offText, "Watched to 34:00 offline · syncs when you’re back online");
eq(g[3]!.seasons[1]!.cards[0]!.offText, "Finished offline · syncs when you’re back online");
eq(g[3]!.seasons[1]!.cards[0]!.watched, true);
eq(g[1]!.seasons[0]!.cards[0]!.offText, null);

const empty = pageView([], 0, w);
eq(empty.empty, true);
eq(empty.summary, "0 ready · 0 in progress");

const lib = pageView([make({ id: 6, title: "Gone", season: 1, episode: 1 })], 0, w);
eq(lib.groups[0]!.title, "Gone");

const st = storageView({ used: 21.9e9, other: 612.4e9, free: 341.8e9 }, w);
same(st.labels, ["21.9 GB Streamline", "612.4 GB other", "341.8 GB free"]);
ok(Math.abs(st.otherPct - 62.7) < 0.1, String(st.otherPct));
eq(storageView({ used: 0, other: 600e9, free: 400e9 }, w).usedPct, 1);

eq(keyOf("series", 3, 2, 4), "series:3:2:4");
eq(keyOf("movies", 7), "movies:7");
eq(rateText(0, 5, w), "Starting…");
eq(rateText(1_500_000, 3e6, w), "1.5 MB/s · 2 s left");
eq(rateText(12_400_000, 12.4e6 * 240, w), "12 MB/s · 4 min left");
eq(rateText(2e6, 2e6 * 4320, w), "2.0 MB/s · 1 h 12 min left");

const none = buttonState(undefined, "Dune", w);
same(none, {
	icon: "arrow-down-to-line",
	tone: "muted",
	pct: 0,
	label: "Download Dune",
	short: "Download",
});
const finished = buttonState(sample[0], "Severance S1 E1", w);
eq(finished.icon, "circle-arrow-down");
eq(finished.tone, "accent");
eq(finished.label, "Remove download of Severance S1 E1");
eq(finished.short, "On device");
const ring = buttonState(sample[5], "Severance S2 E4", w);
eq(ring.icon, null);
eq(ring.tone, "progress");
eq(ring.pct, 46);
eq(ring.label, "Cancel download of Severance S2 E4");
eq(ring.short, "46%");

const ten = Array.from({ length: 10 }, (_, i) => keyOf("series", 1, 1, i + 1));
const mk = (done: number, active: number, pct = 0.6) => {
	const m = new Map<string, DownloadEntry>();
	for (const [i, k] of ten.slice(0, done).entries())
		m.set(k, make({ id: 1, title: "S", season: 1, episode: i + 1 }));
	for (const [i, k] of ten.slice(done, done + active).entries())
		m.set(
			k,
			make({
				id: 1,
				title: "S",
				season: 1,
				episode: done + i + 1,
				state: "downloading",
				progress: pct,
			}),
		);
	return (k: string) => m.get(k);
};
const act = bulkState(ten, mk(5, 1), "Season 1", "season", w);
eq(act.text, "6/10 · 56%");
eq(act.label, "Downloading Season 1 · 56%");
eq(act.act, "popover");
eq(act.pct, 56);
const all = bulkState(ten, mk(10, 0), "Season 1", "season", w);
eq(all.text, "Season on device");
eq(all.label, "Remove Season 1 from this device");
eq(all.act, "popover");
eq(bulkState(ten, mk(10, 0), "Severance", "series", w).text, "Series on device");
const some = bulkState(ten, mk(7, 0), "Season 1", "season", w);
eq(some.text, "Download 3 more");
eq(some.label, "Download Season 1 · 3 episodes");
eq(some.act, "start");
same(some.missing, ten.slice(7));
eq(bulkState(ten, mk(0, 0), "Season 1", "season", w).text, "Download season");
eq(bulkState(ten, mk(0, 0), "Severance", "series", w).text, "Download series");
eq(
	bulkState(ten.slice(0, 1), mk(0, 0), "Season 1", "season", w).label,
	"Download Season 1 · 1 episode",
);
eq(bulkState([], mk(0, 0), "Season 1", "season", w).act, "none");

const pop1 = popoverView(
	[sample[5]!.key],
	(k) => sample.find((e) => e.key === k),
	5e6,
	"Severance S2 E4",
	w,
);
eq(pop1.state, "downloading");
eq(pop1.got, "0.7 of 1.6 GB");
eq(pop1.progress, 46);
eq(pop1.count, null);
eq(pop1.size, "1.6 GB");
eq(pop1.quality, "1080p");
eq(pop1.cause, null);
const grpMap = mk(3, 0);
const grp = popoverView(ten, grpMap, 0, "Season 1", w);
same(grp.count, { done: 3, total: 3 });
const ten3 = [...ten];
const mixed = new Map(
	ten.map((k, i) => [
		k,
		make({ id: 1, title: "S", season: 1, episode: i + 1, state: i < 3 ? "done" : "queued" }),
	]),
);
const gm = popoverView(ten3, (k) => mixed.get(k), 0, "Season 1", w);
same(gm.count, { done: 3, total: 10 });
eq(gm.state, "waiting");
eq(gm.rate, "Queued");
const doneOne = popoverView(
	[sample[0]!.key],
	(k) => sample.find((e) => e.key === k),
	0,
	"Severance S1 E1",
	w,
);
eq(doneOne.state, "done");
eq(doneOne.size, "1.8 GB");
eq(doneOne.quality, "1080p");
const f = make({ id: 9, title: "X", state: "failed", progress: 0.5, error: "no_space", size: 2e9 });
const pf = popoverView([f.key], () => f, 0, "X", w);
eq(pf.state, "failed");
eq(pf.cause, "Not enough space on this computer");
eq(pf.kept, "1.0 GB kept");

const audio: AudioTrack[] = [
	{ index: 1, codec: "truehd", channels: 8, language: "eng", default: true },
	{ index: 2, codec: "eac3", channels: 6, language: "fra", default: false },
	{ index: 3, codec: "aac", channels: 2, language: "jpn", default: false },
];
const subs: SubTrack[] = [
	{ index: 4, codec: "subrip", language: "eng", forced: false, sdh: false, files: {} },
	{ index: 5, codec: "hdmv_pgs_subtitle", language: "fra", forced: false, sdh: false, files: {} },
	{ index: 6, codec: "subrip", language: "fra", forced: true, sdh: false, files: {} },
];
const tracks: Tracks = {
	preparing: false,
	container: "mkv",
	video: { codec: "hevc", width: 3840, height: 2160 },
	chapters: [],
	markers: { intro: null, credits: null },
	audio,
	subtitles: subs,
	fonts: [],
	trickplay: null,
};

eq(audioRate("truehd", 8), 4_600_000);
eq(audioRate("dts", 6), 3_400_000);
eq(audioRate("eac3", 6), 640_000);
eq(audioRate("ac3", 6), 640_000);
eq(audioRate("aac", 2), 192_000);
eq(converts("truehd", "original"), false);
eq(converts("truehd", "1080p"), true);
eq(converts("eac3", "720p"), false);
eq(converts("aac", "720p"), false);

const base = {
	fileBitRate: 20e6,
	minutes: 120,
	audio: audio.slice(0, 2),
	picked: [1, 2],
	subs: [],
	pickedSubs: [],
};
const orig = estimate({ ...base, quality: "original" });
ok(Math.abs(orig.total - 18e9) / 18e9 < 0.01, String(orig.total));
const p1080 = estimate({ ...base, quality: "1080p" });
ok(Math.abs(p1080.video - 7.2e9) < 1e6);
ok(Math.abs(p1080.audio[0]! - (640_000 * 7200) / 8) < 1);
const bare = estimate({ ...base, quality: "1080p", picked: [] });
eq(bare.total, bare.video);
const withSubs = estimate({ ...base, quality: "1080p", picked: [], subs, pickedSubs: [4, 5] });
eq(withSubs.total, withSubs.video + 60e3 + 30e6);
eq(sizeText(1.84e9), "1.8 GB");
eq(sizeText(6.4e8), "640 MB");
eq(sizeText(60000), "60 KB");
eq(sizeText(10), "1 KB");

const pv = (o: Partial<Parameters<typeof pickView>[0]>, canShow = () => true) =>
	pickView(
		{ label: "Dune", count: 1, quality: "original", audio: [1], subs: [], remember: false, ...o },
		tracks,
		20e6,
		120,
		canShow,
		w,
	);
eq(pv({}).qNote, "The file as it is on the server: 2160p hevc. Nothing is converted.");
eq(
	pv({ quality: "1080p" }).qNote,
	"The server converts it to 1080p first, so the download takes longer to start.",
);
const three = pv({ quality: "1080p", count: 3 });
eq(three.qNote, "The server converts them to 1080p first, so the download takes longer to start.");
ok(three.total.endsWith(" · 3 episodes"), three.total);
eq(pv({}).audio[0]!.sub, "TrueHD 7.1");
eq(pv({}).audio[0]!.label, "English · original");
eq(pv({ quality: "1080p" }).audio[0]!.sub, "TrueHD 7.1 → EAC3 5.1");
eq(pv({ quality: "1080p" }).audio[1]!.sub, "EAC3 5.1");
eq(pv({}).audio[1]!.label, "French");
eq(pv({}).audio[0]!.on, true);
eq(pv({}).audio[1]!.on, false);
const cant = pv({ subs: [5] }, () => false);
eq(cant.subs[1]!.disabled, true);
ok(cant.subs[1]!.sub.endsWith("can’t be shown here"));
eq(cant.subs[1]!.on, false);
eq(pv({ subs: [5] }, (t) => t.index !== 5).subs[0]!.disabled, false);
eq(pv({ audio: [] }).canDownload, false);
eq(pv({}).canDownload, true);
eq(pv({}).title, "Download Dune");

same(
	pickDefaults(tracks, { audio: "English", subs: "forced" }, () => true),
	{ audio: [1], subs: [] },
);
same(
	pickDefaults(tracks, { audio: "French", subs: "forced" }, () => true),
	{ audio: [1, 2], subs: [6] },
);
same(
	pickDefaults(tracks, { audio: "English", subs: "French" }, () => true),
	{ audio: [1], subs: [5] },
);
same(
	pickDefaults(tracks, { audio: "English", subs: "French" }, (t) => t.index !== 5),
	{ audio: [1], subs: [6] },
);
same(
	pickDefaults(tracks, { audio: "French", subs: "off" }, () => true),
	{ audio: [1, 2], subs: [] },
);

console.log("downloads-view-check: ok");
