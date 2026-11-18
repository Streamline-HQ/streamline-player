import { nextEpisode, playUrl } from "#lib/core/browse.ts";
import type { Kind, Title, Watch } from "#lib/core/types.ts";
import { watchInfo } from "#lib/core/watch-info.ts";

export type Flag = "unwatched" | "progress" | "watched" | "uhd" | "hdr" | "short" | "binge";
/** The menu's sorts, then the ones only the list's column heads offer. */
export type Sort = "added" | "title" | "year" | "rating" | "size" | "resolution" | "hdr" | "audio";
export type Layout = "grid" | "list";
export type Tab = "browse" | "all";
export type View = {
	tab: Tab;
	flags: Flag[];
	genre: string | null;
	sort: Sort;
	/** Against the sort's own direction: A→Z for title and audio, biggest or newest first for the rest. */
	sortRev: boolean;
	layout: Layout;
};

export const FLAGS: Flag[] = ["unwatched", "progress", "watched", "uhd", "hdr", "short", "binge"];
/** One title is in exactly one of these, so only one can be asked for at a time. */
export const WATCH_FLAGS: Flag[] = ["unwatched", "progress", "watched"];
export const MENU_SORTS: Sort[] = ["added", "title", "year", "rating", "size"];
export const SORTS: Sort[] = [...MENU_SORTS, "resolution", "hdr", "audio"];
export const DEFAULT_VIEW: View = {
	tab: "browse",
	flags: [],
	genre: null,
	sort: "title",
	sortRev: false,
	layout: "grid",
};
const SHORT_MINUTES = 110;
const BINGE_SEASONS = 3;

export function toggleFlag(flags: Flag[], f: Flag): Flag[] {
	if (flags.includes(f)) return flags.filter((x) => x !== f);
	const rivals = WATCH_FLAGS.includes(f) ? WATCH_FLAGS : [];
	return [...flags.filter((x) => !rivals.includes(x)), f];
}

/** The watch state asked for, if any. */
export const watchFlag = (flags: Flag[]) => flags.find((f) => WATCH_FLAGS.includes(f)) ?? null;

/** The flags with the watch state asked for replaced by `state`, or dropped for null. */
export function setWatch(flags: Flag[], state: Flag | null): Flag[] {
	const rest = flags.filter((f) => !WATCH_FLAGS.includes(f));
	return state ? [...rest, state] : rest;
}

/** Percent watched of the unfinished play, 0 when there is none. */
export function progressOf(t: Title, kind: Kind, watch: Watch[]): number {
	const row = watch.find(
		(w) =>
			(kind === "movies" ? w.movie_id === t.id : w.series_id === t.id) &&
			!w.watched &&
			w.position_seconds > 0,
	);
	return row && row.duration_seconds > 0
		? Math.round((row.position_seconds / row.duration_seconds) * 100)
		: 0;
}

const matches: Record<Flag, (t: Title, kind: Kind, watch: Watch[]) => boolean> = {
	unwatched: (t, kind, watch) => watchInfo(t, kind, watch).unread,
	progress: (t, kind, watch) => watchInfo(t, kind, watch).inProgress,
	watched: (t, kind, watch) => watchInfo(t, kind, watch).watched,
	uhd: (t) => t.file_summary?.resolution === "2160p",
	hdr: (t) => !!t.file_summary?.hdr,
	short: (t) => !!t.runtime && t.runtime <= SHORT_MINUTES,
	binge: (t) => (t.total_seasons ?? t.seasons?.length ?? 0) >= BINGE_SEASONS,
};

const flagged = (titles: Title[], kind: Kind, watch: Watch[], flags: Flag[]) =>
	titles.filter((t) => flags.every((f) => matches[f](t, kind, watch)));

/** Every genre of the titles, counted among those that pass the flags; a genre with no title left is still listed, with 0. */
export function genres(titles: Title[], kind: Kind, watch: Watch[], flags: Flag[]) {
	const counts = new Map<string, number>();
	for (const t of titles) for (const g of t.genres) counts.set(g, counts.get(g) ?? 0);
	for (const t of flagged(titles, kind, watch, flags))
		for (const g of t.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
	return [...counts]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const res = (t: Title) => Number.parseInt(t.file_summary?.resolution ?? "", 10) || 0;
const audio = (t: Title) => `${t.file_summary?.audio ?? ""}${t.file_summary?.channels ?? ""}`;

const sorters: Record<Sort, (a: Title, b: Title) => number> = {
	added: (a, b) => Date.parse(b.added_at) - Date.parse(a.added_at),
	title: (a, b) => a.title.localeCompare(b.title),
	year: (a, b) => b.year - a.year,
	rating: (a, b) => b.rating - a.rating,
	size: (a, b) => (b.file_summary?.size ?? 0) - (a.file_summary?.size ?? 0),
	resolution: (a, b) => res(b) - res(a),
	hdr: (a, b) =>
		Number(!!b.file_summary?.hdr) - Number(!!a.file_summary?.hdr) ||
		(a.file_summary?.hdr ?? "").localeCompare(b.file_summary?.hdr ?? ""),
	audio: (a, b) => audio(a).localeCompare(audio(b)),
};

const ASCENDING: Sort[] = ["title", "audio"];

/** The direction the list runs in, for a column head's arrow and `aria-sort`. */
export const sortDirection = (sort: Sort, rev: boolean): "ascending" | "descending" =>
	ASCENDING.includes(sort) !== rev ? "ascending" : "descending";

/** Picking the sort in use flips it; another one starts in its own direction. */
export const pickSort = (v: View, sort: Sort): View =>
	v.sort === sort ? { ...v, sortRev: !v.sortRev } : { ...v, sort, sortRev: false };

export function visible(titles: Title[], kind: Kind, watch: Watch[], v: View): Title[] {
	const list = flagged(titles, kind, watch, v.flags)
		.filter((t) => !v.genre || t.genres.includes(v.genre))
		.sort((a, b) => sorters[v.sort](a, b) || a.title.localeCompare(b.title));
	return v.sortRev ? list.reverse() : list;
}

export function viewToQuery(v: View): string {
	const parts: string[] = [];
	if (v.tab !== DEFAULT_VIEW.tab) parts.push(`tab=${v.tab}`);
	if (v.flags.length) parts.push(`flags=${v.flags.join(",")}`);
	if (v.genre) parts.push(`genre=${encodeURIComponent(v.genre)}`);
	if (v.sort !== DEFAULT_VIEW.sort) parts.push(`sort=${v.sort}`);
	if (v.sortRev) parts.push("rev=1");
	if (v.layout !== DEFAULT_VIEW.layout) parts.push(`layout=${v.layout}`);
	return parts.join("&");
}

export function viewFromQuery(q: URLSearchParams): View {
	const flags = (q.get("flags") ?? "")
		.split(",")
		.filter((f): f is Flag => (FLAGS as string[]).includes(f))
		.reduce<Flag[]>((acc, f) => (acc.includes(f) ? acc : toggleFlag(acc, f)), []);
	const sort = q.get("sort");
	return {
		tab: q.get("tab") === "all" ? "all" : "browse",
		flags,
		genre: q.get("genre") || null,
		sort: (SORTS as string[]).includes(sort ?? "") ? (sort as Sort) : DEFAULT_VIEW.sort,
		sortRev: q.get("rev") === "1",
		layout: q.get("layout") === "list" ? "list" : "grid",
	};
}

/** The episode a poster's play button starts: the one under way, else the next one up. */
export function episodeFor(t: Title, watch: Watch[]) {
	const going = watch.find((w) => w.series_id === t.id && !w.watched && w.position_seconds > 0);
	const files = (t.seasons ?? []).flatMap((s) =>
		s.episodes.filter((e) => e.has_file).map((e) => ({ ...e, season: s.number })),
	);
	return (
		(going && files.find((e) => e.id === going.episode_id)) ||
		nextEpisode(t, watch) ||
		(going?.episode_id ? { id: going.episode_id } : undefined)
	);
}

/** Where a poster's play button goes, resuming an unfinished play. */
export function playHref(t: Title, kind: Kind, watch: Watch[]): string {
	const resuming = progressOf(t, kind, watch) > 0;
	return kind === "movies"
		? playUrl("movies", t.id, undefined, resuming)
		: playUrl("series", t.id, episodeFor(t, watch)?.id, resuming);
}

export type RailId = "recent" | "top" | "unstarted" | "genre" | "uhd" | "short" | "binge";
export type Rail = {
	id: RailId;
	/** The genre a genre rail is about. */
	genre?: string;
	titles: Title[];
	/** What the rail's note counts: every title that qualifies, or the new ones for "recent". */
	count: number;
	wide: boolean;
	/** The All tab as the rail's "See all" opens it. */
	seeAll: View;
};

const RAIL_MAX = 14;
const SHORT_RAIL_MAX = 10;

/** Library's Browse tab, in order; a rail with nothing in it is left out. */
export function browseRails(
	titles: Title[],
	kind: Kind,
	watch: Watch[],
	isNew: (t: Title) => boolean,
): Rail[] {
	const byRating = (a: Title, b: Title) => b.rating - a.rating;
	const all = (over: Partial<View>): View => ({
		...DEFAULT_VIEW,
		tab: "all",
		sort: "rating",
		...over,
	});
	const rail = (
		id: RailId,
		list: Title[],
		seeAll: View,
		{
			max = RAIL_MAX,
			count = list.length,
			wide = false,
			genre,
		}: Partial<Rail> & { max?: number } = {},
	): Rail => ({ id, genre, titles: list.slice(0, max), count, wide, seeAll });
	const counts = new Map<string, number>();
	for (const t of titles) for (const g of t.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
	const topGenres = [...counts]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, 3)
		.map(([g]) => g);
	const where = (f: Flag) => titles.filter((t) => matches[f](t, kind, watch)).sort(byRating);
	const extra: Flag = kind === "movies" ? "short" : "binge";
	return [
		rail("recent", [...titles].sort(sorters.added), all({ sort: "added" }), {
			max: SHORT_RAIL_MAX,
			count: titles.filter(isNew).length,
			wide: true,
		}),
		rail("top", [...titles].sort(byRating), all({}), { max: SHORT_RAIL_MAX }),
		rail("unstarted", where("unwatched"), all({ flags: ["unwatched"] })),
		...topGenres.map((g) =>
			rail("genre", titles.filter((t) => t.genres.includes(g)).sort(byRating), all({ genre: g }), {
				genre: g,
			}),
		),
		rail("uhd", where("uhd"), all({ flags: ["uhd"] })),
		rail(extra, where(extra), all({ flags: [extra] })),
	].filter((r) => r.titles.length > 0);
}
