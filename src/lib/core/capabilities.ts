export type Caps = {
	video: { codec: string }[];
	hdr: { formats: string[] };
	audio: { codecs: string[]; passthrough: string[] };
	subtitles?: string[];
};
export type Chip = { group: "video" | "audio" | "subs"; name: string; ok: boolean };

/** What a player reports, as the chips Settings lists. Subtitles only when the player reports them. */
export function chips(c: Caps): Chip[] {
	const video = new Set(c.video.map((x) => x.codec));
	const audio = new Set([...c.audio.codecs, ...c.audio.passthrough]);
	const hdr = new Set(c.hdr.formats);
	const subs = c.subtitles ? new Set(c.subtitles) : null;
	return [
		{ group: "video", name: "H.264", ok: video.has("h264") },
		{ group: "video", name: "HEVC", ok: video.has("hevc") },
		{ group: "video", name: "AV1", ok: video.has("av1") },
		{ group: "video", name: "VP9", ok: video.has("vp9") },
		{ group: "video", name: "HDR10", ok: hdr.has("hdr10") },
		{ group: "video", name: "Dolby Vision", ok: hdr.has("dolby_vision") },
		{ group: "audio", name: "AAC", ok: audio.has("aac") },
		{ group: "audio", name: "AC3", ok: audio.has("ac3") },
		{ group: "audio", name: "EAC3", ok: audio.has("eac3") },
		{ group: "audio", name: "TrueHD", ok: audio.has("truehd") },
		{ group: "audio", name: "DTS", ok: audio.has("dts") },
		{ group: "audio", name: "FLAC", ok: audio.has("flac") },
		...(subs
			? [
					{ group: "subs" as const, name: "ASS", ok: subs.has("ass") },
					{ group: "subs" as const, name: "SRT", ok: subs.has("srt") },
					{ group: "subs" as const, name: "PGS", ok: subs.has("pgs") },
					{ group: "subs" as const, name: "VobSub", ok: subs.has("vobsub") },
				]
			: []),
	];
}
