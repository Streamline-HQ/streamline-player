export type Trickplay = {
	interval: number;
	tileWidth: number;
	tileHeight: number;
	cols: number;
	rows: number;
	count: number;
	sheets: string[];
};

const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

export function parseTrickplay(indexUrl: string, text: string): Trickplay | null {
	let raw: Record<string, unknown>;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (!raw || typeof raw !== "object") return null;
	const { interval, tile_width, tile_height, cols, rows, count, sheets } = raw;
	if (
		!positive(interval) ||
		!positive(tile_width) ||
		!positive(tile_height) ||
		!positive(cols) ||
		!positive(rows) ||
		!positive(count) ||
		!Array.isArray(sheets) ||
		!sheets.length ||
		!sheets.every((s) => typeof s === "string")
	)
		return null;
	// The sheets sit beside the index and share its signature: only the last path segment changes.
	const base = new URL(indexUrl);
	const resolved = sheets.map((name: string) => {
		const u = new URL(base);
		u.pathname = u.pathname.slice(0, u.pathname.lastIndexOf("/") + 1) + name;
		return u.href;
	});
	return {
		interval,
		tileWidth: tile_width,
		tileHeight: tile_height,
		cols,
		rows,
		count,
		sheets: resolved,
	};
}

export function tileAt(tp: Trickplay, seconds: number) {
	const i = Math.max(0, Math.min(tp.count - 1, Math.floor(seconds / tp.interval)));
	const per = tp.cols * tp.rows;
	const within = i % per;
	const sheet = tp.sheets[Math.min(tp.sheets.length - 1, Math.floor(i / per))] ?? "";
	return {
		sheet,
		x: (within % tp.cols) * tp.tileWidth,
		y: Math.floor(within / tp.cols) * tp.tileHeight,
		w: tp.tileWidth,
		h: tp.tileHeight,
	};
}
