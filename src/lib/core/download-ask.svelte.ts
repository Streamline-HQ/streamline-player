import { converts, estimate, sizeText } from "#lib/core/download-size.ts";
import { keyOf, pickDefaults } from "#lib/core/downloads-view.ts";
import { type DownloadsPort, entry, remove, retry, start } from "#lib/core/downloads.svelte.ts";
import { nowPlaying, stop } from "#lib/core/playback/now-playing.svelte.ts";
import { toast } from "#lib/core/toast.svelte.ts";
import {
	type Choice,
	defaultChoice,
	effectiveChoice,
	loadChoices,
} from "#lib/core/playback/choice.ts";
import { languageLabel, subInfo } from "#lib/core/playback/names.ts";
import type { SubTrack, Tracks } from "#lib/core/playback/port.ts";
import { myLanguage, prefs, setPref } from "#lib/core/prefs.svelte.ts";
import type { DownloadEntry, DownloadQuality, DownloadRequest } from "#lib/core/types.ts";
import { m as i18n } from "#lib/paraglide/messages.js";

export type AskItem = {
	key: string;
	mediaId: string;
	label: string;
	minutes: number;
	meta: DownloadEntry["meta"];
	watched: boolean;
};
export type AskPort = {
	downloads: DownloadsPort;
	tracks(mediaId: string): Promise<Tracks>;
	bitRate(mediaId: string): Promise<number>;
	capabilities(): Promise<unknown>;
};
export type PickState = {
	items: AskItem[];
	label: string;
	tracks: Tracks;
	fileBitRate: number;
	quality: DownloadQuality;
	audio: number[];
	subs: number[];
	remember: boolean;
};
export type PopoverState = {
	keys: string[];
	label: string;
	anchor: DOMRect | null;
	group: boolean;
};

export const asking: { pick: PickState | null; popover: PopoverState | null } = $state({
	pick: null,
	popover: null,
});

let port: AskPort | null = null;

const QUALITY: Record<string, DownloadQuality> = {
	Original: "original",
	"1080p": "1080p",
	"720p": "720p",
};
export const qualityPref = (): DownloadQuality => QUALITY[prefs.dlQuality] ?? "1080p";
export const canShowSub = (t: SubTrack) => !subInfo(t).burnOnly;

function choiceFor(first: AskItem, tracks: Tracks, genres: string[]): Choice {
	const m = first.meta;
	const own = effectiveChoice(loadChoices(), {
		kind: m.kind,
		id: m.title_id,
		season: m.season ?? undefined,
		episode: m.episode ?? undefined,
	});
	return (
		own ??
		defaultChoice(tracks.audio, {
			audioLang: prefs.audioLang,
			subsMode: prefs.subsMode,
			myLanguage: myLanguage(),
			anime: genres.some((g) => /^(anime|animation)$/i.test(g)),
			animeRule: prefs.animeRule,
		})
	);
}

function requestsOf(
	items: AskItem[],
	tracks: Tracks,
	fileBitRate: number,
	quality: DownloadQuality,
	audio: number[],
	subs: number[],
): DownloadRequest[] {
	const taken = tracks.audio.filter((t) => audio.includes(t.index));
	const shown = tracks.subtitles.filter((t) => subs.includes(t.index) && canShowSub(t));
	return items.map((it) => ({
		key: it.key,
		media_id: it.mediaId,
		quality,
		audio: taken.map((t) => ({
			index: t.index,
			language: t.language,
			codec: t.codec,
			converted: converts(t.codec, quality),
		})),
		subtitles: shown.map((t) => ({ index: t.index, language: t.language, codec: t.codec })),
		size: Math.round(
			estimate({
				quality,
				fileBitRate,
				minutes: it.minutes,
				audio: tracks.audio,
				picked: audio,
				subs: tracks.subtitles,
				pickedSubs: shown.map((t) => t.index),
			}).total,
		),
		meta: it.meta,
		watched: it.watched,
	}));
}

async function begin(
	p: AskPort,
	items: AskItem[],
	tracks: Tracks,
	fileBitRate: number,
	quality: DownloadQuality,
	audio: number[],
	subs: number[],
) {
	const requests = requestsOf(items, tracks, fileBitRate, quality, audio, subs);
	try {
		await start(p.downloads, requests, await p.capabilities());
	} catch {
		toast(i18n.settings_err_unknown(), { icon: "wifi", warning: true });
		return;
	}
	const langs = (list: { language: string }[]) => [
		...new Set(list.map((t) => languageLabel(t.language))),
	];
	const named = quality === "original" ? i18n.dl_quality_original() : quality;
	const audioLangs = langs(requests[0]!.audio).join(", ");
	const subLangs = langs(requests[0]!.subtitles).join(", ");
	const text = subLangs
		? i18n.dl_toast_line({ quality: named, languages: audioLangs, subs: subLangs })
		: i18n.dl_toast_line_none({ quality: named, languages: audioLangs });
	const total = requests.reduce((n, r) => n + r.size, 0);
	toast(
		items.length > 1
			? i18n.dl_toast_downloading_many({ n: items.length, size: sizeText(total) })
			: i18n.dl_toast_downloading({ label: items[0]!.label }),
		{ text },
	);
}

/** With `dlPick` on, opens the picker; off, starts the items with what would play. */
export async function request(p: AskPort, items: AskItem[], label: string, genres: string[] = []) {
	const first = items[0];
	if (!first) return;
	port = p;
	let tracks: Tracks;
	let fileBitRate: number;
	try {
		[tracks, fileBitRate] = await Promise.all([p.tracks(first.mediaId), p.bitRate(first.mediaId)]);
	} catch {
		toast(i18n.settings_err_unknown(), { icon: "wifi", warning: true });
		return;
	}
	const picks = pickDefaults(tracks, choiceFor(first, tracks, genres), canShowSub);
	const quality = qualityPref();
	if (!prefs.dlPick) return begin(p, items, tracks, fileBitRate, quality, picks.audio, picks.subs);
	asking.pick = {
		items,
		label,
		tracks,
		fileBitRate,
		quality,
		audio: picks.audio,
		subs: picks.subs,
		remember: false,
	};
}

export async function confirmPick() {
	const pick = asking.pick;
	if (!pick || !port || !pick.audio.length) return;
	asking.pick = null;
	if (pick.remember) {
		setPref("dlPick", false);
		setPref("dlQuality", pick.quality === "original" ? "Original" : pick.quality);
	}
	await begin(port, pick.items, pick.tracks, pick.fileBitRate, pick.quality, pick.audio, pick.subs);
}

export const closePick = () => {
	asking.pick = null;
};

export function openPopover(keys: string[], label: string, anchor: DOMRect | null, group: boolean) {
	asking.popover = { keys, label, anchor, group };
}

export const closePopover = () => {
	asking.popover = null;
};

/** A download that is playing goes quiet first: the file must not vanish under mpv. */
export async function removeKeys(p: DownloadsPort, keys: string[]) {
	const playing = nowPlaying.launch?.view;
	if (playing && keys.includes(keyOf(playing.kind, playing.id, playing.season, playing.episode)))
		await stop();
	await remove(p, keys);
}

const cancelledText = (n: number) =>
	n === 1 ? i18n.dl_toast_cancelled_one() : i18n.dl_toast_cancelled_many({ n });

/** "Cancel remaining" and "Remove all" of one popover: finished downloads are removed only when nothing else is left. */
export async function dropFromPopover(p: DownloadsPort) {
	const pop = asking.popover;
	if (!pop) return;
	const live = pop.keys.map(entry).filter((e) => !!e);
	const allDone = live.every((e) => e.state === "done");
	const drop =
		pop.group && !allDone ? live.filter((e) => e.state !== "done").map((e) => e.key) : pop.keys;
	asking.popover = null;
	await removeKeys(p, drop);
	if (pop.group)
		toast(allDone ? i18n.dl_toast_removed_title({ title: pop.label }) : cancelledText(drop.length));
	else toast(allDone ? i18n.dl_toast_removed() : i18n.dl_toast_cancelled());
}

export async function retryFromPopover(p: DownloadsPort) {
	const pop = asking.popover;
	if (!pop) return;
	for (const key of pop.keys) if (entry(key)?.state === "failed") await retry(p, key);
}

/** One button's click: no download yet asks for one, any download opens its popover. */
export function clickOne(
	p: AskPort,
	e: MouseEvent,
	key: string,
	label: string,
	item: () => Promise<AskItem | null> | AskItem | null,
	genres: string[] = [],
) {
	if (entry(key)) {
		openPopover([key], label, (e.currentTarget as HTMLElement).getBoundingClientRect(), false);
		return;
	}
	Promise.resolve(item()).then((it) => {
		if (it) request(p, [it], label, genres);
	});
}

export function clickGroup(
	p: AskPort,
	e: MouseEvent,
	act: "start" | "popover" | "none",
	keys: string[],
	name: string,
	missing: () => Promise<AskItem[]> | AskItem[],
	genres: string[] = [],
) {
	if (act === "popover")
		openPopover(keys, name, (e.currentTarget as HTMLElement).getBoundingClientRect(), true);
	else if (act === "start")
		Promise.resolve(missing()).then((items) => {
			if (items.length) request(p, items, name, genres);
		});
}
