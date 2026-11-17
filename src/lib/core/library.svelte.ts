import { equal, reconcile } from "#lib/core/reconcile.ts";
import type { HomeFeed, Kind, Title, Watch } from "#lib/core/types.ts";

export type LibraryPort = {
	library(kind: Kind): Promise<Title[]>;
	watchState(): Promise<Watch[]>;
	home(): Promise<HomeFeed>;
	/** A series' list entry has no seasons; the ones on Home need them for their episode. */
	title(kind: Kind, id: number): Promise<Title>;
};

/** One store for every screen, so a title marked watched on one is watched on the others. */
export const lib: {
	movies: Title[];
	shows: Title[];
	watch: Watch[];
	feed: HomeFeed | null;
	loaded: boolean;
	error: string | null;
} = $state({ movies: [], shows: [], watch: [], feed: null, loaded: false, error: null });

let inflight: Promise<void> | null = null;

const seriesOnHome = (watch: Watch[], feed: HomeFeed) => [
	...new Set([
		...watch.filter((w) => !w.watched && w.position_seconds > 0).flatMap((w) => w.series_id ?? []),
		...feed.featured.filter((f) => f.kind === "series").map((f) => f.id),
	]),
];

async function fetchAll(port: LibraryPort) {
	const [movies, shows, watch, feed] = await Promise.all([
		port.library("movies"),
		port.library("series"),
		port.watchState(),
		port.home(),
	]);
	const known = new Set(shows.map((s) => s.id));
	const details = new Map(
		(
			await Promise.all(
				seriesOnHome(watch, feed)
					.filter((id) => known.has(id))
					.map((id) =>
						port.title("series", id).then(
							(d) => [id, d] as const,
							() => null,
						),
					),
			)
		).filter((e) => e !== null),
	);
	const seen = new Map(lib.shows.filter((s) => s.seasons).map((s) => [s.id, s]));
	lib.movies = reconcile(lib.movies, movies, (t) => t.id);
	lib.shows = reconcile(
		lib.shows,
		shows.map((s) => details.get(s.id) ?? seen.get(s.id) ?? s),
		(t) => t.id,
	);
	lib.watch = reconcile(lib.watch, watch, (w) => w.media_id);
	if (!equal(lib.feed, feed)) lib.feed = feed;
	lib.loaded = true;
	lib.error = null;
}

/** Concurrent callers share one request set. A loaded library is kept as it is unless `force`: screens then show it at once and a refresh replaces only what changed. */
export function loadLibrary(port: LibraryPort, force = false): Promise<void> {
	if (inflight) return inflight;
	if (lib.loaded && !force) return Promise.resolve();
	// An earlier failure may be from before the sign-in: it says nothing about this attempt.
	lib.error = null;
	inflight = fetchAll(port)
		.catch((e) => {
			if (!lib.loaded) lib.error = String(e);
		})
		.finally(() => {
			inflight = null;
		});
	return inflight;
}

export function applyWatch(
	mediaId: string,
	watched: boolean,
	ref?: Pick<Watch, "movie_id" | "series_id" | "season" | "episode_id">,
) {
	const row = lib.watch.find((w) => w.media_id === mediaId);
	if (row) {
		row.watched = watched;
		if (!watched) row.position_seconds = 0;
	} else if (watched) {
		lib.watch.unshift({
			media_id: mediaId,
			position_seconds: 0,
			duration_seconds: 0,
			watched,
			...ref,
		});
	}
}

const DETAIL_BATCH = 6;

/** List entries carry no seasons, which a series needs to know whether it is watched and which episode Play starts. */
export function loadSeasons(port: Pick<LibraryPort, "title">): Promise<void> {
	seasonsInflight ??= fetchSeasons(port).finally(() => {
		seasonsInflight = null;
	});
	return seasonsInflight;
}

let seasonsInflight: Promise<void> | null = null;

async function fetchSeasons(port: Pick<LibraryPort, "title">) {
	const missing = lib.shows.filter((s) => !s.seasons).map((s) => s.id);
	for (let i = 0; i < missing.length; i += DETAIL_BATCH) {
		await Promise.all(
			missing.slice(i, i + DETAIL_BATCH).map((id) =>
				port.title("series", id).then(
					(d) => {
						const at = lib.shows.findIndex((s) => s.id === id);
						if (at >= 0) lib.shows[at] = d;
					},
					() => {},
				),
			),
		);
	}
}
