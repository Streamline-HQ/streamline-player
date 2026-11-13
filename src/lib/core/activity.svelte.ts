import type { ActivityEvent } from "#lib/core/types.ts";

export type ActivityPort = {
	activity(): Promise<ActivityEvent[]>;
	markActivityRead(ids: string[]): Promise<unknown>;
};

const FRESH_MS = 60_000;

export const feed: { items: ActivityEvent[]; loaded: boolean; error: string | null } = $state({
	items: [],
	loaded: false,
	error: null,
});

let inflight: Promise<void> | null = null;
let loadedAt = 0;

export function loadActivity(port: ActivityPort, force = false) {
	if (inflight) return inflight;
	if (!force && feed.loaded && Date.now() - loadedAt < FRESH_MS) return Promise.resolve();
	inflight = port
		.activity()
		.then(
			(items) => {
				feed.items = items;
				feed.loaded = true;
				feed.error = null;
				loadedAt = Date.now();
			},
			(e) => {
				feed.error = e instanceof Error ? e.message : String(e);
			},
		)
		.finally(() => {
			inflight = null;
		});
	return inflight;
}

export const unread = () => feed.items.filter((e) => !e.read).length;

export async function markRead(port: ActivityPort, ids: string[]) {
	const changed = feed.items.filter((e) => !e.read && ids.includes(e.id));
	if (!changed.length) return true;
	for (const e of changed) e.read = true;
	try {
		await port.markActivityRead(changed.map((e) => e.id));
		return true;
	} catch {
		for (const e of changed) e.read = false;
		return false;
	}
}

export const markAllRead = (port: ActivityPort) =>
	markRead(
		port,
		feed.items.filter((e) => !e.read).map((e) => e.id),
	);

export function resetActivity() {
	feed.items = [];
	feed.loaded = false;
	feed.error = null;
	loadedAt = 0;
}
