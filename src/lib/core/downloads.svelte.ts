import type {
	DownloadEntry,
	DownloadRequest,
	DownloadsEvent,
	DownloadStorage,
} from "#lib/core/types.ts";

export type DownloadsPort = {
	downloads(): Promise<DownloadEntry[]>;
	onDownloads(cb: (e: DownloadsEvent) => void): Promise<() => void>;
	startDownloads(items: DownloadRequest[], capabilities: unknown): Promise<unknown>;
	removeDownloads(keys: string[]): Promise<unknown>;
	retryDownload(key: string): Promise<unknown>;
	downloadStorage(): Promise<DownloadStorage>;
};

export const dl: {
	items: DownloadEntry[];
	rate: number;
	loaded: boolean;
	storage: DownloadStorage | null;
} = $state({ items: [], rate: 0, loaded: false, storage: null });

const ACTIVE = ["queued", "preparing", "downloading", "waiting"];

export const entry = (key: string) => dl.items.find((e) => e.key === key);
export const anyActive = () => dl.items.some((e) => ACTIVE.includes(e.state));

/** Loads the queue and follows its events. `ondone` hears each entry that finishes while the app watches. */
export async function initDownloads(
	port: DownloadsPort,
	ondone?: (e: DownloadEntry) => void,
): Promise<() => void> {
	const apply = (items: DownloadEntry[], rate: number) => {
		const before = new Map(dl.items.map((e) => [e.key, e.state]));
		dl.items = items;
		dl.rate = rate;
		dl.loaded = true;
		for (const e of items) {
			const was = before.get(e.key);
			if (e.state === "done" && was !== undefined && was !== "done") ondone?.(e);
		}
	};
	let fresh = false;
	const stop = await port.onDownloads((e) => {
		fresh = true;
		apply(e.items, e.rate);
	});
	try {
		const items = await port.downloads();
		if (!fresh) {
			dl.items = items;
			dl.loaded = true;
		}
	} catch {
		dl.loaded = true;
	}
	return stop;
}

export async function refreshStorage(port: DownloadsPort) {
	try {
		dl.storage = await port.downloadStorage();
	} catch {
		// The meter keeps what it last showed.
	}
}

export const start = (port: DownloadsPort, items: DownloadRequest[], capabilities: unknown) =>
	port.startDownloads(items, capabilities);
export const remove = (port: DownloadsPort, keys: string[]) => port.removeDownloads(keys);
export const retry = (port: DownloadsPort, key: string) => port.retryDownload(key);

export function resetDownloads() {
	dl.items = [];
	dl.rate = 0;
	dl.loaded = false;
	dl.storage = null;
}
