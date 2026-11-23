import type { Tone } from "#lib/core/server-view.ts";

export const TONES: Record<Tone, { fg: string; bg: string; line: string }> = {
	ok: {
		fg: "var(--status-available)",
		bg: "rgb(var(--status-available-rgb) / 10%)",
		line: "rgb(var(--status-available-rgb) / 28%)",
	},
	warn: {
		fg: "var(--status-warning)",
		bg: "rgb(var(--status-warning-rgb) / 10%)",
		line: "rgb(var(--status-warning-rgb) / 32%)",
	},
	err: {
		fg: "var(--status-failed)",
		bg: "rgb(var(--status-failed-rgb) / 10%)",
		line: "rgb(var(--status-failed-rgb) / 32%)",
	},
	accent: {
		fg: "var(--accent-text)",
		bg: "rgb(var(--accent-rgb) / 12%)",
		line: "rgb(var(--accent-rgb) / 32%)",
	},
	muted: { fg: "var(--fg-muted)", bg: "var(--surface)", line: "var(--border-strong)" },
};
