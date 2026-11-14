import type { DownloadsPort } from "#lib/core/downloads.svelte.ts";
import {
	downloadStorage,
	downloads,
	onDownloads,
	removeDownloads,
	retryDownload,
	startDownloads,
} from "#platform";

export const downloadsPort: DownloadsPort = {
	downloads,
	onDownloads,
	startDownloads,
	removeDownloads,
	retryDownload,
	downloadStorage,
};
