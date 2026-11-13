// node dev/player-panels-check.ts
import { strictEqual as eq, deepStrictEqual as same, ok } from "node:assert";
import { haltFor } from "../src/lib/core/playback/halt.ts";
import { panelWords } from "../src/lib/core/playback/panel-words.ts";
import {
	audioRows,
	haltView,
	qualityRows,
	speedRows,
	statsRows,
	subtitleRows,
} from "../src/lib/core/player-panels.ts";

const words = panelWords("mpv");
const MBIT = 1_000_000;

const session = (over = {}) => ({
	session_id: "s1",
	mode: "direct",
	url: "http://engine.home.arpa:8097/hls/s1/index.m3u8",
	bandwidth: 8 * MBIT,
	video: { action: "copy", codec: "hevc", width: 3840, height: 1608, hdr: "hdr10" },
	audio: { action: "copy", codec: "eac3", channels: 6 },
	video_reasons: [],
	audio_reasons: [],
	hw: "vaapi",
	...over,
});
const decision = (over = {}) => ({
	mode: "direct",
	video: { action: "copy", codec: "hevc", width: 3840, height: 1608, hdr: "hdr10" },
	audio: { action: "copy", codec: "eac3", channels: 6 },
	video_reasons: [],
	audio_reasons: [],
	needs_slot: false,
	bandwidth: 8 * MBIT,
	...over,
});
const sub = (index: number, over = {}) => ({
	index,
	codec: "subrip",
	language: "eng",
	forced: false,
	sdh: false,
	files: {},
	...over,
});
const audio = (index: number, language: string, codec = "eac3", channels = 6) => ({
	index,
	codec,
	channels,
	language,
	default: index === 1,
});
const tracks = (over = {}) => ({
	preparing: false,
	container: "mkv",
	video: { codec: "hevc", width: 3840, height: 1608, hdr: "hdr10" },
	chapters: [],
	markers: { intro: null, credits: null },
	audio: [audio(1, "eng"), audio(2, "fra", "dts", 6)],
	subtitles: [sub(3), sub(4, { language: "fra", codec: "hdmv_pgs_subtitle" })],
	fonts: [],
	trickplay: null,
	...over,
});

// audio
{
	const t = tracks();
	const preview = {
		bitRate: 40 * MBIT,
		presets: {},
		audio: {
			1: decision(),
			2: decision({
				mode: "audio_transcode",
				audio: { action: "transcode", codec: "eac3", channels: 6 },
			}),
		},
	};
	const rows = audioRows(t, t.audio[0], preview, session(), words);
	eq(rows.length, 2);
	eq(rows[0].label, "English (original)");
	eq(rows[0].badge, "as-is");
	eq(rows[0].sub, "EAC3 5.1");
	eq(rows[0].on, true);
	eq(rows[1].label, "French");
	eq(rows[1].badge, "converted");
	eq(rows[1].sub, "DTS 5.1 → EAC3 5.1");
	eq(rows[1].on, false);
}

// subtitles
{
	const t = tracks({ subtitles: [sub(3), sub(4, { language: "fra", codec: "dvd_subtitle" })] });
	const rows = subtitleRows(t, null, words);
	eq(rows[0].label, "Off");
	eq(rows[0].on, true);
	eq(rows[1].on, false);
	ok(rows[2].sub?.endsWith("· burn in"), rows[2].sub);
	eq(rows[2].badge, "converts the video");
	eq(subtitleRows(t, 3, words)[1].on, true);

	const preparing = subtitleRows(
		tracks({ preparing: true, subtitles: [sub(3), sub(4, { codec: "dvd_subtitle" })] }),
		null,
		words,
	);
	eq(preparing[1].sub, "Preparing…");
	eq(preparing[1].disabled, true);
	eq(preparing[2].disabled, undefined, "a burn-in track needs no prepared file");
}

// quality
{
	const t = tracks();
	const preview = {
		bitRate: 38 * MBIT,
		original: decision(),
		presets: {
			20: decision({
				mode: "transcode",
				video: { action: "transcode", codec: "hevc", width: 3840, height: 1608, hdr: "hdr10" },
				needs_slot: true,
			}),
			8: decision({
				mode: "transcode",
				video: { action: "transcode", codec: "h264", width: 1920, height: 800, hdr: "sdr" },
				needs_slot: true,
			}),
			4: decision({
				mode: "transcode",
				video: { action: "transcode", codec: "h264", width: 1920, height: 800, hdr: "sdr" },
				needs_slot: true,
			}),
			2: decision({
				mode: "transcode",
				video: { action: "transcode", codec: "h264", width: 1280, height: 534, hdr: "sdr" },
				needs_slot: true,
			}),
			1: decision({
				mode: "transcode",
				video: { action: "transcode", codec: "h264", width: 1280, height: 534, hdr: "sdr" },
				needs_slot: true,
			}),
		},
		audio: {},
	};
	const base = {
		qSel: "auto",
		autoPick: undefined,
		measuredOnce: false,
		originalPlays: true,
		preview,
		tracks: t,
	};
	const rows = qualityRows(base, words);
	same(
		rows.map((r) => r.id),
		["auto", "original", "20", "8", "4", "2", "1"],
	);
	same(
		rows.map((r) => r.label),
		["Auto", "Original", "20 Mbit/s", "8 Mbit/s", "4 Mbit/s", "2 Mbit/s", "1 Mbit/s"],
	);
	eq(rows[0].on, true);
	eq(rows[1].disabled, undefined);
	eq(rows[2].pill, "HDR", "a converted preset that keeps HDR is marked");
	eq(rows[3].pill, undefined);

	const copyPreset = { ...preview, presets: { ...preview.presets, 20: decision() } };
	const same20 = qualityRows({ ...base, preview: copyPreset }, words)[2];
	eq(same20.sub, "Same as Original · the file is 38.0 Mbit/s");

	const gone = qualityRows(
		{
			...base,
			originalPlays: false,
			preview: {
				...preview,
				original: decision({
					mode: "transcode",
					video: { action: "transcode", codec: "h264", width: 3840, height: 1608, hdr: "sdr" },
					video_reasons: [{ code: "x", text: "HEVC isn’t decodable here" }],
				}),
			},
		},
		words,
	)[1];
	eq(gone.sub, "Not on this device · HEVC isn’t decodable here");
	eq(gone.disabled, true);
}

// speed
same(
	speedRows(1, words).map((r) => r.label),
	["0.5×", "0.75×", "Normal", "1.25×", "1.5×", "2×"],
);
same(
	speedRows(1.5, words).map((r) => r.on),
	[false, false, false, false, true, false],
);

// stats
{
	const t = tracks();
	const live = {
		player: "mpv 0.39",
		version: "0.39",
		buffer: 12.4,
		videoBitrate: 8 * MBIT,
		audioBitrate: 0.64 * MBIT,
		rendered: 1000,
		dropped: 2,
		displayHz: 60,
	};
	const input = (over = {}) => ({
		session: session(),
		live,
		encodeSpeed: null,
		tracks: t,
		selectedAudio: t.audio[0],
		subPick: null,
		burn: false,
		subOffset: 0,
		audioDelay: 0,
		measured: 20 * MBIT,
		throughput: null,
		host: "engine.home.arpa:8097",
		playerName: "mpv",
		full: true,
		speed: 1,
		...over,
	});
	const direct = statsRows(input(), words);
	const key = (rows: { label: string }[]) => rows.map((r) => r.label);
	ok(!key(direct).includes("Encode"));
	ok(!key(direct).includes("Offsets"));
	ok(!key(direct).includes("Display"));
	eq(direct.find((r) => r.label === "Container")?.value, "MKV · the file itself");
	eq(direct.find((r) => r.label === "Mode")?.value, "Direct · the original file");
	eq(direct.at(-1)?.value, "engine.home.arpa:8097 · /file");

	const converted = statsRows(
		input({
			session: session({
				mode: "transcode",
				video: { action: "transcode", codec: "h264", width: 1920, height: 800, hdr: "sdr" },
				video_reasons: [{ code: "x", text: "no HEVC" }],
			}),
			encodeSpeed: 2.1,
			subOffset: 0.5,
		}),
		words,
	);
	ok(key(converted).includes("Encode"));
	ok(key(converted).includes("Offsets"));
	eq(converted.find((r) => r.label === "Container")?.value, "MKV → fMP4 · HLS");
	eq(converted.find((r) => r.label === "why")?.value, "no HEVC");
	ok(converted.find((r) => r.label === "Encode")?.value.startsWith("2.1× realtime · VAAPI"));
	eq(statsRows(input({ session: null }), words).length, 0);
}

// halts
{
	const ctx = (over = {}) => ({
		title: "Dune: Part Two",
		host: "streamline.home.arpa",
		position: 754,
		isAdmin: false,
		routes: { serverSettings: false },
		...over,
	});
	const error = (code: string, extra = {}) =>
		JSON.stringify({ error: { code, message: "m", ...extra } });
	const view = (raw: string, c = ctx()) =>
		haltView(haltFor(raw, { host: c.host, at: "12:34", titleName: c.title }, "mpv").halt, c, words);

	const unreachable = view("connection refused");
	eq(unreachable.eyebrow, "Can’t reach the server");
	eq(unreachable.title, "streamline.home.arpa isn’t answering");
	same(
		unreachable.actions.map((a) => a.label),
		["Try now", "Back to Dune: Part Two"],
	);
	eq(unreachable.actions[0].primary, true);
	eq(
		unreachable.actions.some((a) => a.label.includes("download")),
		false,
	);

	const noCodec = view(error("transcode_unavailable"), ctx({ isAdmin: true }));
	eq(
		noCodec.actions.some((a) => a.label === "Open Server settings"),
		false,
	);
	same(
		noCodec.actions.map((a) => a.id),
		["back"],
	);

	const stop = view(error("session_stopped", { by: "Alex", message: "Backup" }));
	same(stop.message, { by: "Alex", text: "Backup" });
	same(
		stop.actions.map((a) => a.id),
		["retry", "back"],
	);

	const busy = haltFor(error("transcode_limit"), { host: "h", at: "1:00" }, "mpv").halt;
	const withAlts = haltView(
		{
			...busy,
			alts: [
				{ icon: "play", label: "Play the original", sub: "Direct play · 4K · 38 Mbit/s", run() {} },
			],
			left: 6,
			total: 10,
		},
		ctx(),
		words,
	);
	same(withAlts.alternatives, [
		{ id: "0", icon: "play", label: "Play the original", sub: "Direct play · 4K · 38 Mbit/s" },
	]);
	eq(withAlts.countdown?.text, "Trying again in 6 s");
	eq(withAlts.countdown?.fraction, 0.6);

	const offline = haltView(
		{
			...haltFor("x", { host: "h" }, "mpv").halt,
			kind: "offline",
			wait: "Waiting for a network · checking every 5 s",
		},
		ctx(),
		words,
	);
	eq(offline.wait, "Waiting for a network · checking every 5 s");
}

console.log("player-panels-check: ok");
