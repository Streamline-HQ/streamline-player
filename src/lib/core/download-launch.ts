import { runtime, stillPos } from "#lib/core/format.ts";
import type { Launch } from "#lib/core/playback/now-playing.svelte.ts";
import type { DownloadEntry } from "#lib/core/types.ts";

/** The player route of a download: the key is rebuilt from it, so the library is not asked. */
export function localUrl(m: DownloadEntry["meta"]) {
	const base = `/player/${m.kind}/${m.title_id}?local=1`;
	return m.season != null && m.episode != null ? `${base}&s=${m.season}&e=${m.episode}` : base;
}

export const localKey = (
	kind: string,
	id: number,
	season: number | null,
	episode: number | null,
) => (kind === "movies" ? `movies:${id}` : `series:${id}:${season}:${episode}`);

/** A launch drawn only from what the download saved, so it starts with the server and the library gone. */
export function localLaunch(
	e: DownloadEntry,
	artworkAt: (path: string) => string,
	start: number,
): Launch {
	const m = e.meta;
	const episode = m.season != null && m.episode != null;
	const poster = artworkAt(m.poster);
	const still = artworkAt(m.still);
	const item = { mediaId: e.media_id, titleName: m.title, anime: false, choice: null, start };
	if (!episode) {
		return {
			key: e.media_id,
			item,
			view: {
				kind: m.kind,
				id: m.title_id,
				href: localUrl(m),
				heading: m.title,
				eyebrow: String(m.year ?? ""),
				sub: `${m.year ?? ""} · ${runtime(m.runtime)}`,
				still,
				poster,
				framePos: "50% 40%",
				synopsis: "",
				more: [],
			},
		};
	}
	const name = m.episode_title ?? "";
	return {
		key: e.media_id,
		item,
		view: {
			kind: m.kind,
			id: m.title_id,
			href: localUrl(m),
			season: m.season!,
			episode: m.episode!,
			heading: name,
			eyebrow: `${m.title} · S${m.season} E${m.episode}`,
			sub: `S${m.season} · E${m.episode} — ${name}`,
			still,
			poster,
			framePos: stillPos(m.episode!, m.season!),
			synopsis: "",
			more: [],
		},
	};
}
