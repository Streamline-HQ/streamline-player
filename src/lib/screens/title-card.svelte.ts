import { isNew, type ResumeItem } from "#lib/core/browse.ts";
import { clickGroup, clickOne } from "#lib/core/download-ask.svelte.ts";
import { episodeItem, episodeKey, movieItem, movieKey } from "#lib/core/download-items.ts";
import { entry } from "#lib/core/downloads.svelte.ts";
import { bulkState, buttonState } from "#lib/core/downloads-view.ts";
import { applyWatch, lib } from "#lib/core/library.svelte.ts";
import { episodeFor, playHref } from "#lib/core/library-view.ts";
import {
	type Choice,
	type Choices,
	defaultChoice,
	loadChoices,
	saveChoices,
} from "#lib/core/playback/choice.ts";
import type { Tracks } from "#lib/core/playback/port.ts";
import { isAnime } from "#lib/core/playback/rules.ts";
import { myLanguage, prefs } from "#lib/core/prefs.svelte.ts";
import { toast } from "#lib/core/toast.svelte.ts";
import type { Kind, Title } from "#lib/core/types.ts";
import { watchInfo } from "#lib/core/watch-info.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import { askPort } from "#lib/screens/downloads-port.ts";
import { downloadWords } from "#lib/ui/download-words.ts";
import { goto } from "#lib/ui/nav.ts";
import { canDownload, title as fetchTitle, playbackPort, setWatched } from "#platform";

export type LangOpen = {
	kind: Kind;
	t: Title;
	tracks: Tracks | null;
	draft: Choice;
	anchor: DOMRect;
};

/** The one audio-and-subtitles popover a card opens; the shell draws it. */
export const cardLang: { open: LangOpen | null; choices: Choices } = $state({
	open: null,
	choices: loadChoices(),
});

const choiceKey = (kind: Kind, id: number) => `${kind}:${id}`;

const subsShort = (c: Choice) =>
	c.subs === "off"
		? i18n.detail_subs_none()
		: c.subs === "forced"
			? i18n.detail_subs_forced()
			: i18n.detail_subs_language({ language: c.subs });

/** The media whose tracks stand for the title: the movie's file, a series' first episode. */
async function sampleMedia(kind: Kind, t: Title) {
	const d = kind === "series" && t.seasons ? t : await fetchTitle(kind, t.id);
	return kind === "movies"
		? d.media_files?.[0]?.id
		: d.seasons?.flatMap((s) => s.episodes).find((e) => e.has_file)?.media_file_id;
}

export async function openCardLang(kind: Kind, t: Title, el: HTMLElement) {
	if (cardLang.open?.t.id === t.id && cardLang.open.kind === kind) {
		cardLang.open = null;
		return;
	}
	let tracks: Tracks | null = null;
	try {
		const media = await sampleMedia(kind, t);
		if (media) tracks = await playbackPort.mediaTracks(media);
	} catch {
		// The popover then says the tracks are not ready.
	}
	if (!el.isConnected) return;
	const draft =
		cardLang.choices[choiceKey(kind, t.id)] ??
		(tracks
			? defaultChoice(tracks.audio, {
					audioLang: prefs.audioLang,
					anime: isAnime(t.genres ?? []),
					animeRule: prefs.animeRule,
					subsMode: prefs.subsMode,
					myLanguage: myLanguage(),
				})
			: { audio: "", subs: "forced" });
	cardLang.open = { kind, t, tracks, draft: { ...draft }, anchor: el.getBoundingClientRect() };
}

export function applyCardLang() {
	const o = cardLang.open;
	if (!o) return;
	cardLang.choices = { ...cardLang.choices, [choiceKey(o.kind, o.t.id)]: o.draft };
	saveChoices(cardLang.choices);
	cardLang.open = null;
}

/** Every media of the title, with what a watch row says it belongs to. */
async function targetsOf(kind: Kind, t: Title) {
	const d = await fetchTitle(kind, t.id);
	return kind === "movies"
		? (d.media_files ?? []).slice(0, 1).map((f) => ({ media: f.id, ref: { movie_id: t.id } }))
		: (d.seasons ?? []).flatMap((s) =>
				s.episodes
					.filter((e) => e.has_file)
					.map((e) => ({
						media: e.media_file_id,
						ref: { series_id: t.id, season: s.number, episode_id: e.id },
					})),
			);
}

export async function toggleWatched(kind: Kind, t: Title) {
	const was = watchInfo(t, kind, lib.watch).watched;
	try {
		const targets = await targetsOf(kind, t);
		await Promise.all(targets.map((x) => setWatched(x.media, !was)));
		for (const x of targets) applyWatch(x.media, !was, x.ref);
		toast(
			kind === "series"
				? was
					? i18n.detail_marked_series_unwatched()
					: i18n.detail_marked_series_watched()
				: was
					? i18n.detail_marked_unwatched()
					: i18n.detail_marked_watched(),
		);
	} catch {}
}

/** Marks only the episode a resume card names, so Continue watching moves on to the next one. */
export async function markResumeWatched(r: ResumeItem) {
	try {
		await setWatched(r.mediaId, true);
		applyWatch(
			r.mediaId,
			true,
			r.kind === "movies"
				? { movie_id: r.id }
				: { series_id: r.id, season: r.season, episode_id: r.episodeId },
		);
		toast(i18n.detail_marked_watched());
	} catch {}
}

export const resumeMark = (r: ResumeItem) => ({
	on: false,
	label: i18n.library_mark_watched({
		title: r.kind === "series" ? `${r.title} ${r.code}` : r.title,
	}),
	onclick: () => markResumeWatched(r),
});

/** Marking the play under way unwatched puts its position back to 0. */
export async function resetProgress(kind: Kind, t: Title, label = t.title) {
	const row = lib.watch.find(
		(w) =>
			(kind === "movies" ? w.movie_id === t.id : w.series_id === t.id) &&
			!w.watched &&
			w.position_seconds > 0,
	);
	if (!row) return;
	try {
		await setWatched(row.media_id, false);
		applyWatch(row.media_id, false);
		toast(i18n.card_reset_done(), { text: i18n.card_reset_text({ title: label }) });
	} catch {}
}

export function playLabel(kind: Kind, t: Title) {
	if (kind === "movies")
		return watchInfo(t, kind, lib.watch).inProgress
			? i18n.library_resume_title({ title: t.title })
			: i18n.library_play_title({ title: t.title });
	const ep = episodeFor(t, lib.watch);
	return ep && "number" in ep
		? i18n.library_play_episode({ title: t.title, season: ep.season, episode: ep.number })
		: i18n.library_play_title({ title: t.title });
}

export function langButton(kind: Kind, t: Title) {
	const own = cardLang.choices[choiceKey(kind, t.id)];
	return {
		own: !!own,
		label: own
			? i18n.card_lang_label({ audio: own.audio, subs: subsShort(own) })
			: i18n.detail_lang_title(),
		onclick: (el: HTMLElement) => openCardLang(kind, t, el),
	};
}

export function downloadButton(kind: Kind, t: Title) {
	if (!canDownload) return undefined;
	const words = downloadWords();
	if (kind === "movies") {
		const key = movieKey(t);
		const e = entry(key);
		const look = buttonState(e, t.title, words);
		return {
			look,
			label: !e
				? look.label
				: e.state === "done"
					? i18n.dl_label_downloaded({ title: t.title })
					: i18n.dl_label_downloading({ title: t.title }),
			onclick: (ev: MouseEvent) =>
				clickOne(
					askPort,
					ev,
					key,
					t.title,
					async () => movieItem(await fetchTitle("movies", t.id), lib.watch),
					t.genres,
				),
		};
	}
	const files = (t.seasons ?? []).flatMap((s) =>
		s.episodes.filter((e) => e.has_file).map((e) => ({ ...e, season: s.number })),
	);
	if (!files.length) return undefined;
	const keys = files.map((e) => episodeKey(t, e));
	const st = bulkState(keys, entry, t.title, "series", words);
	return {
		look: st,
		label: st.label,
		onclick: (ev: MouseEvent) =>
			clickGroup(
				askPort,
				ev,
				st.act,
				keys,
				t.title,
				() =>
					files
						.filter((e) => st.missing.includes(episodeKey(t, e)))
						.map((e) => episodeItem(t, e, lib.watch)),
				t.genres,
			),
	};
}

/** Everything a title card shows and does, the same on every screen. */
export function titleCard(kind: Kind, t: Title, now: Date) {
	const info = watchInfo(t, kind, lib.watch);
	return {
		info,
		badge: isNew(t, now) ? i18n.home_new() : undefined,
		leftLabel: i18n.card_left_label({ count: info.left }),
		playLabel: playLabel(kind, t),
		onplay: () => goto(playHref(t, kind, lib.watch)),
		reset:
			!info.watched && info.pct > 0
				? {
						label: i18n.card_reset_label({ title: t.title }),
						onclick: () => resetProgress(kind, t),
					}
				: undefined,
		mark: {
			on: info.watched,
			label: info.watched
				? i18n.library_mark_unwatched({ title: t.title })
				: i18n.library_mark_watched({ title: t.title }),
			onclick: () => toggleWatched(kind, t),
		},
		lang: langButton(kind, t),
		download: downloadButton(kind, t),
	};
}
