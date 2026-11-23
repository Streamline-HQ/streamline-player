export type TvKey =
	| "Back"
	| "Enter"
	| "ArrowUp"
	| "ArrowDown"
	| "ArrowLeft"
	| "ArrowRight"
	| "PlayPause"
	| "Play"
	| "Pause"
	| "Stop"
	| "FastForward"
	| "Rewind";

const BY_KEY: Record<string, TvKey> = {
	Escape: "Back",
	Backspace: "Back",
	GoBack: "Back",
	BrowserBack: "Back",
	Enter: "Enter",
	ArrowUp: "ArrowUp",
	ArrowDown: "ArrowDown",
	ArrowLeft: "ArrowLeft",
	ArrowRight: "ArrowRight",
	MediaPlayPause: "PlayPause",
	MediaPlay: "Play",
	MediaPause: "Pause",
	Pause: "Pause",
	MediaStop: "Stop",
	MediaFastForward: "FastForward",
	MediaRewind: "Rewind",
};

// webOS reports Back as 461 with `key` possibly "Unidentified"; Samsung documents key codes only.
const BY_CODE: Record<number, TvKey> = {
	461: "Back",
	10009: "Back",
	13: "Enter",
	38: "ArrowUp",
	40: "ArrowDown",
	37: "ArrowLeft",
	39: "ArrowRight",
	10252: "PlayPause",
	415: "Play",
	19: "Pause",
	413: "Stop",
	417: "FastForward",
	412: "Rewind",
};

/** What a remote or a keyboard key means to the TV layout; null for any other key. */
export const tvKey = (e: Pick<KeyboardEvent, "key" | "keyCode">): TvKey | null =>
	BY_KEY[e.key] ?? BY_CODE[e.keyCode] ?? null;

/** Tizen sends media keys to an app only once it has registered them. */
export function registerTizenKeys() {
	const input = (globalThis as { tizen?: TizenGlobal }).tizen?.tvinputdevice;
	input?.registerKeyBatch([
		"MediaPlayPause",
		"MediaPlay",
		"MediaPause",
		"MediaStop",
		"MediaFastForward",
		"MediaRewind",
	]);
}

type TizenGlobal = { tvinputdevice?: { registerKeyBatch(keys: string[]): void } };
