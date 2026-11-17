// node --import ./dev/controller-check/register.mjs dev/library-store-check.ts
import { strictEqual as eq, ok } from "node:assert";
import type { HomeFeed, Kind, Title, Watch } from "../src/lib/core/types.ts";

const { lib, loadLibrary } = await import("../src/lib/core/library.svelte.ts");

const movie = (id: number, size: number): Title => ({
	id,
	title: `Movie ${id}`,
	year: 2000 + id,
	overview: "",
	genres: ["Drama"],
	rating: 7,
	added_at: "2026-11-01T00:00:00Z",
	file_summary: { resolution: "1080p", size },
});
const sizes = [10, 20, 30];
const port = {
	async library(kind: Kind) {
		return kind === "movies" ? sizes.map((s, i) => movie(i + 1, s)) : [];
	},
	async watchState(): Promise<Watch[]> {
		return [
			{ media_id: "m1", movie_id: 1, position_seconds: 5, duration_seconds: 100, watched: false },
		];
	},
	async home(): Promise<HomeFeed> {
		return { featured: [], arrivals: [] };
	},
	async title(): Promise<Title> {
		throw new Error("unused");
	},
};

await loadLibrary({
	...port,
	async library() {
		throw new Error("unauthorized");
	},
});
ok(lib.error?.includes("unauthorized"));
const retry = loadLibrary(port);
eq(lib.error, null);
await retry;

const [movies, watch, feed] = [lib.movies, lib.watch, lib.feed];
const [first, second] = [lib.movies[0], lib.movies[1]];

await loadLibrary(port, true);
eq(lib.movies, movies);
eq(lib.watch, watch);
eq(lib.feed, feed);

sizes[1] = 99;
await loadLibrary(port, true);
ok(lib.movies !== movies);
eq(lib.movies[0], first);
ok(lib.movies[1] !== second);
eq(lib.movies[1]?.file_summary?.size, 99);
eq(lib.watch, watch);
