// node dev/library-check.ts
import { deepStrictEqual as eq } from "node:assert";
import {
	browseRails,
	DEFAULT_VIEW,
	genres,
	pickSort,
	setWatch,
	toggleFlag,
	type View,
	viewFromQuery,
	viewToQuery,
	sortDirection,
	visible,
} from "../src/lib/core/library-view.ts";
import type { Title, Watch } from "../src/lib/core/types.ts";
import { watchInfo } from "../src/lib/core/watch-info.ts";

const movie = (
	id: number,
	name: string,
	added: string,
	year: number,
	rating: number,
	genre: string[],
	summary: Title["file_summary"],
): Title => ({
	id,
	title: name,
	year,
	overview: "",
	genres: genre,
	rating,
	added_at: added,
	file_summary: summary,
});
const movies = [
	movie(1, "The Matrix", "2026-09-01T00:00:00Z", 1999, 8.7, ["Science Fiction", "Action"], {
		resolution: "1080p",
		size: 2_000,
	}),
	movie(2, "Arrival", "2026-10-01T00:00:00Z", 2016, 7.9, ["Science Fiction", "Drama"], {
		resolution: "1080p",
		size: 1_000,
	}),
	movie(3, "Dune", "2026-11-01T00:00:00Z", 2021, 8.0, ["Science Fiction"], {
		resolution: "2160p",
		hdr: "HDR10",
		size: 9_000,
	}),
];
const watch: Watch[] = [
	{ media_id: "m1", movie_id: 1, position_seconds: 0, duration_seconds: 100, watched: true },
];
const v: View = {
	tab: "all",
	flags: ["uhd", "hdr"],
	genre: "Drama",
	sort: "year",
	sortRev: true,
	layout: "list",
};

eq(toggleFlag(["unwatched"], "progress"), ["progress"]);
eq(toggleFlag(["uhd"], "uhd"), []);
eq(toggleFlag(["progress", "uhd"], "watched"), ["uhd", "watched"]);
eq(setWatch(["uhd"], "unwatched"), ["uhd", "unwatched"]);
eq(setWatch(["uhd", "unwatched"], "progress"), ["uhd", "progress"]);
eq(setWatch(["progress"], "watched"), ["watched"]);
eq(setWatch(["watched", "hdr"], null), ["hdr"]);
eq(
	visible(movies, "movies", watch, { ...DEFAULT_VIEW, flags: ["unwatched"] }).map((t) => t.id),
	[2, 3],
);
eq(
	visible(movies, "movies", watch, { ...DEFAULT_VIEW, flags: ["uhd", "hdr"] }).map((t) => t.id),
	[3],
);
eq(
	visible(movies, "movies", watch, { ...DEFAULT_VIEW, sort: "title" }).map((t) => t.title),
	["Arrival", "Dune", "The Matrix"],
);
eq(
	visible(movies, "movies", watch, { ...DEFAULT_VIEW, sort: "size" }).map((t) => t.id),
	[3, 1, 2],
);
eq(
	visible(movies, "movies", watch, { ...DEFAULT_VIEW, sortRev: true }).map((t) => t.title),
	["The Matrix", "Dune", "Arrival"],
);
eq(
	visible(movies, "movies", watch, { ...DEFAULT_VIEW, sort: "resolution" }).map((t) => t.id),
	[3, 2, 1],
);
eq(pickSort(DEFAULT_VIEW, "title").sortRev, true);
eq(pickSort({ ...DEFAULT_VIEW, sortRev: true }, "year"), { ...DEFAULT_VIEW, sort: "year" });
eq(sortDirection("title", false), "ascending");
eq(sortDirection("size", false), "descending");
eq(sortDirection("size", true), "ascending");
eq(
	visible(movies, "movies", watch, { ...DEFAULT_VIEW, genre: "Drama" }).map((t) => t.id),
	[2],
);
eq(genres(movies, "movies", watch, [])[0], { name: "Science Fiction", count: 3 });
eq(
	genres(movies, "movies", watch, ["uhd"]).find((g) => g.name === "Drama"),
	{
		name: "Drama",
		count: 0,
	},
);
eq(viewToQuery(DEFAULT_VIEW), "");
eq(viewToQuery(v), "tab=all&flags=uhd,hdr&genre=Drama&sort=year&rev=1&layout=list");
eq(viewFromQuery(new URLSearchParams(viewToQuery(v))), v);
eq(
	viewFromQuery(new URLSearchParams(viewToQuery({ ...DEFAULT_VIEW, genre: "Sci Fi & Co" }))).genre,
	"Sci Fi & Co",
);
eq(viewFromQuery(new URLSearchParams("sort=nope&flags=x,uhd")), {
	...DEFAULT_VIEW,
	flags: ["uhd"],
});
const rails = browseRails(movies, "movies", watch, (t) => t.id === 3);
eq(
	rails.map((r) => [r.id, r.genre, r.titles.map((t) => t.id), r.count]),
	[
		["recent", undefined, [3, 2, 1], 1],
		["top", undefined, [1, 3, 2], 3],
		["unstarted", undefined, [3, 2], 2],
		["genre", "Science Fiction", [1, 3, 2], 3],
		["genre", "Action", [1], 1],
		["genre", "Drama", [2], 1],
		["uhd", undefined, [3], 1],
	],
);
eq(rails[2]?.seeAll, { ...DEFAULT_VIEW, tab: "all", sort: "rating", flags: ["unwatched"] });

const show: Title = {
	id: 9,
	title: "Severance",
	year: 2022,
	overview: "",
	genres: [],
	rating: 8,
	added_at: "2026-11-01T00:00:00Z",
	episodes: { total: 4, watched: 1, started: 2 },
};
eq(watchInfo(show, "series", []), {
	watched: false,
	pct: 0,
	inProgress: false,
	unread: false,
	left: 3,
});
eq(
	watchInfo({ ...show, episodes: { total: 4, watched: 0, started: 0 } }, "series", []).unread,
	true,
);
const ep = (id: number, media: string) => ({
	id,
	number: id,
	title: "",
	overview: "",
	runtime: 50,
	has_file: true,
	media_file_id: media,
});
const loaded = {
	...show,
	seasons: [{ number: 1, name: "", episodes: [ep(1, "e1"), ep(2, "e2")] }],
};
const going: Watch = {
	media_id: "e2",
	series_id: 9,
	episode_id: 2,
	position_seconds: 25,
	duration_seconds: 100,
	watched: false,
};
eq(watchInfo(loaded, "series", [going]), {
	watched: false,
	pct: 25,
	inProgress: true,
	unread: false,
	left: 2,
});
eq(
	watchInfo(loaded, "series", [
		{ ...going, media_id: "e1", watched: true },
		{ ...going, watched: true },
	]).watched,
	true,
);
console.log("library-check ok");
