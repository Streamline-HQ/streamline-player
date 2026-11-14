import type { AudioTrack, SubTrack } from "#lib/core/playback/port.ts";
import type { DownloadQuality } from "#lib/core/types.ts";

const CONVERTED_RATE = 640_000;
const IMAGE_SUB_BYTES = 30e6;
const TEXT_SUB_BYTES = 60e3;
const VIDEO_FLOOR = 1_000_000;
const VIDEO_CAP: Record<DownloadQuality, number> = {
	original: Number.POSITIVE_INFINITY,
	"1080p": 8_000_000,
	"720p": 4_000_000,
};

const IMAGE_SUBS = /pgs|dvd|dvb|vobsub|xsub/i;
export const isImageSub = (codec: string) => IMAGE_SUBS.test(codec);

/** Bit/s of one audio track as the file carries it: the design's `audioGb`, with EAC3 standing in for Atmos. */
export function audioRate(codec: string, _channels: number) {
	if (/truehd/i.test(codec)) return 4_600_000;
	if (/dts/i.test(codec)) return 3_400_000;
	if (/^e?ac-?3$/i.test(codec)) return CONVERTED_RATE;
	return 192_000;
}

/** Whether the server re-encodes this audio at this quality. */
export const converts = (codec: string, q: DownloadQuality) =>
	q !== "original" && !/^(aac|e?ac-?3)$/i.test(codec);

const bytesOver = (rate: number, minutes: number) => (rate * (minutes * 60)) / 8;

/** Bytes of one audio track over the runtime, as the download carries it. */
export const audioBytes = (t: AudioTrack, q: DownloadQuality, minutes: number) =>
	bytesOver(converts(t.codec, q) ? CONVERTED_RATE : audioRate(t.codec, t.channels), minutes);

export const subBytes = (s: SubTrack) => (isImageSub(s.codec) ? IMAGE_SUB_BYTES : TEXT_SUB_BYTES);

export function estimate(i: {
	quality: DownloadQuality;
	fileBitRate: number;
	minutes: number;
	audio: AudioTrack[];
	picked: number[];
	subs: SubTrack[];
	pickedSubs: number[];
}) {
	const own = i.audio.reduce((n, t) => n + audioRate(t.codec, t.channels), 0);
	const rate = Math.min(Math.max(VIDEO_FLOOR, i.fileBitRate - own), VIDEO_CAP[i.quality]);
	const video = bytesOver(rate, i.minutes);
	const audioOf = (t: AudioTrack) => audioBytes(t, i.quality, i.minutes);
	const sum = <T extends { index: number }>(list: T[], on: number[], size: (t: T) => number) =>
		list.reduce((n, t) => n + (on.includes(t.index) ? size(t) : 0), 0);
	return {
		video,
		audio: i.audio.map(audioOf),
		subs: i.subs.map(subBytes),
		total: video + sum(i.audio, i.picked, audioOf) + sum(i.subs, i.pickedSubs, subBytes),
	};
}

export function sizeText(bytes: number) {
	if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
	if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
	return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}
