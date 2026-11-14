import type { AskPort } from "#lib/core/download-ask.svelte.ts";
import type { DownloadsPort } from "#lib/core/downloads.svelte.ts";
import {
	decisions,
	downloadStorage,
	downloads,
	onDownloads,
	playbackPort,
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

export const askPort: AskPort = {
	downloads: downloadsPort,
	tracks: (mediaId) => playbackPort.mediaTracks(mediaId),
	// Without the file's bit rate the picker still opens: the estimate then rests on its floor.
	bitRate: (mediaId) =>
		decisions(mediaId, [{}]).then(
			(r) => r.bit_rate,
			() => 0,
		),
	capabilities: () => playbackPort.capabilities(),
};
