export type Capabilities = {
	video: {
		codec: string;
		profiles: string[];
		max_level: number | null;
		max_width: number;
		max_height: number;
		max_fps: number;
	}[];
	hdr: { formats: string[]; dv_profiles: number[] };
	audio: { codecs: string[]; max_channels: number; passthrough: string[] };
	containers: string[];
	subtitles: string[];
	hls_keyframe_exact: boolean;
};

/** What the browser answers; a stand-in replaces it in the Node check. */
export type Probe = {
	supported(type: string): boolean;
	/** Decodes this stream smoothly: `null` when the browser cannot say. */
	decodes(type: string, width: number, height: number, fps: number): Promise<boolean | null>;
	hdrDisplay: boolean;
};

type Family = {
	codec: string;
	profiles: [name: string, type: (level: number) => string][];
	levels: number[];
	/** The profile whose levels set `max_level`. */
	ladder: number;
	hdrProfile?: string;
};

const mp4 = (codec: string) => `video/mp4; codecs="${codec}"`;
const hex = (n: number) => (n % 256).toString(16).toUpperCase().padStart(2, "0");

const FAMILIES: Family[] = [
	{
		codec: "h264",
		profiles: [
			["constrained baseline", (l) => mp4(`avc1.42E0${hex(l)}`)],
			["main", (l) => mp4(`avc1.4D40${hex(l)}`)],
			["high", (l) => mp4(`avc1.6400${hex(l)}`)],
			["high 10", (l) => mp4(`avc1.6E00${hex(l)}`)],
		],
		levels: [30, 31, 32, 40, 41, 42, 50, 51, 52],
		ladder: 2,
		hdrProfile: "high 10",
	},
	{
		codec: "hevc",
		profiles: [
			["main", (l) => mp4(`hvc1.1.6.L${l}.B0`)],
			["main 10", (l) => mp4(`hvc1.2.4.L${l}.B0`)],
		],
		levels: [90, 93, 120, 123, 150, 153, 156, 180],
		ladder: 0,
		hdrProfile: "main 10",
	},
	{
		codec: "av1",
		profiles: [["main", (l) => mp4(`av01.0.${String(l).padStart(2, "0")}M.08`)]],
		levels: [8, 9, 12, 13, 16],
		ladder: 0,
	},
	{
		codec: "vp9",
		profiles: [
			["profile 0", () => 'video/webm; codecs="vp09.00.40.08"'],
			["profile 2", () => 'video/webm; codecs="vp09.02.40.10"'],
		],
		levels: [0],
		ladder: 0,
		hdrProfile: "profile 2",
	},
];

const SIZES: [number, number][] = [
	[3840, 2160],
	[2560, 1440],
	[1920, 1080],
	[1280, 720],
];

const AUDIO: Record<string, string> = {
	aac: 'audio/mp4; codecs="mp4a.40.2"',
	mp3: 'audio/mp4; codecs="mp4a.6B"',
	ac3: 'audio/mp4; codecs="ac-3"',
	eac3: 'audio/mp4; codecs="ec-3"',
	opus: 'audio/mp4; codecs="opus"',
	flac: 'audio/mp4; codecs="flac"',
	vorbis: 'audio/webm; codecs="vorbis"',
};

const DOLBY_VISION: [number, string][] = [
	[5, 'video/mp4; codecs="dvh1.05.06"'],
	[8, 'video/mp4; codecs="dvh1.08.06"'],
];

async function videoCap(
	family: Family,
	probe: Probe,
): Promise<Capabilities["video"][number] | null> {
	const level = family.levels[0] ?? 0;
	const profiles = family.profiles.filter(([, type]) => probe.supported(type(level)));
	if (!profiles.length) return null;
	const [, ladderType] = family.profiles[family.ladder] ?? profiles[0]!;
	const climbed = family.levels.filter((l) => probe.supported(ladderType(l)));
	const top = family.levels.length > 1 ? (climbed.at(-1) ?? null) : null;
	const type = ladderType(top ?? level);
	let width = 1920;
	let height = 1080;
	let fps = 60;
	for (const [w, h] of SIZES) {
		const smooth = await probe.decodes(type, w, h, 60);
		if (smooth === null) break;
		if (smooth) {
			[width, height] = [w, h];
			break;
		}
		if (await probe.decodes(type, w, h, 30)) {
			[width, height, fps] = [w, h, 30];
			break;
		}
		[width, height] = [w, h];
	}
	return {
		codec: family.codec,
		profiles: profiles.map(([name]) => name),
		max_level: top,
		max_width: width,
		max_height: height,
		max_fps: fps,
	};
}

export async function buildCaps(probe: Probe): Promise<Capabilities> {
	const found = await Promise.all(FAMILIES.map((f) => videoCap(f, probe)));
	const video = found.filter((v) => v !== null);
	const tenBit = FAMILIES.some((f) => {
		const wanted = f.hdrProfile;
		return !!wanted && video.some((v) => v.codec === f.codec && v.profiles.includes(wanted));
	});
	const dv = DOLBY_VISION.filter(([, type]) => probe.supported(type)).map(([profile]) => profile);
	return {
		video,
		hdr: {
			formats: [
				...(probe.hdrDisplay && tenBit ? ["hdr10"] : []),
				...(dv.length ? ["dolby_vision"] : []),
			],
			dv_profiles: dv,
		},
		audio: {
			codecs: Object.keys(AUDIO).filter((k) => probe.supported(AUDIO[k]!)),
			max_channels: 6,
			passthrough: [],
		},
		containers: ["mp4"],
		subtitles: ["webvtt", "srt"],
		hls_keyframe_exact: false,
	};
}

export const browserProbe = (): Probe => ({
	supported: (type) => typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(type),
	decodes: async (type, width, height, fps) => {
		if (!navigator.mediaCapabilities) return null;
		try {
			const info = await navigator.mediaCapabilities.decodingInfo({
				type: "media-source",
				video: { contentType: type, width, height, bitrate: 20_000_000, framerate: fps },
			});
			return info.supported && info.smooth;
		} catch {
			return null;
		}
	},
	hdrDisplay: matchMedia("(dynamic-range: high)").matches,
});

export const browserCaps = () => buildCaps(browserProbe());
