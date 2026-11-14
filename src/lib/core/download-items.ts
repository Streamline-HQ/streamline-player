import type { AskItem } from "#lib/core/download-ask.svelte.ts";
import { keyOf } from "#lib/core/downloads-view.ts";
import type { Episode, Title, Watch } from "#lib/core/types.ts";

type Ep = Episode & { season: number };

const seen = (watch: Watch[], mediaId: string) =>
	!!watch.find((w) => w.media_id === mediaId)?.watched;

export const episodeLabel = (t: Title, season: number, number: number) =>
	`${t.title} S${season} E${number}`;

export const movieKey = (t: Title) => keyOf("movies", t.id);
export const episodeKey = (t: Title, e: Ep) => keyOf("series", t.id, e.season, e.number);

/** The artwork paths are what the `artwork` scheme takes; a download keeps its own copy. */
export function movieItem(t: Title, watch: Watch[]): AskItem | null {
	const media = t.media_files?.[0]?.id;
	if (!media) return null;
	return {
		key: movieKey(t),
		mediaId: media,
		label: t.title,
		minutes: t.runtime ?? 0,
		watched: seen(watch, media),
		meta: {
			kind: "movies",
			title_id: t.id,
			title: t.title,
			year: t.year,
			runtime: t.runtime ?? 0,
			season: null,
			episode: null,
			episode_title: null,
			poster: `movies/${t.id}/poster.jpg`,
			still: `movies/${t.id}/backdrop.jpg`,
		},
	};
}

export function episodeItem(t: Title, e: Ep, watch: Watch[]): AskItem {
	return {
		key: episodeKey(t, e),
		mediaId: e.media_file_id,
		label: episodeLabel(t, e.season, e.number),
		minutes: e.runtime,
		watched: seen(watch, e.media_file_id),
		meta: {
			kind: "series",
			title_id: t.id,
			title: t.title,
			year: null,
			runtime: e.runtime,
			season: e.season,
			episode: e.number,
			episode_title: e.title,
			poster: `series/${t.id}/poster.jpg`,
			still: `series/${t.id}/backdrop.jpg`,
		},
	};
}
