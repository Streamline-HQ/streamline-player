import type { Tone } from "#lib/core/server-view.ts";

export const TONES: Record<Tone, { fg: string; bg: string; line: string }> = {
	ok: {
		fg: "var(--status-available)",
		bg: "color-mix(in srgb, var(--status-available) 10%, transparent)",
		line: "color-mix(in srgb, var(--status-available) 28%, transparent)",
	},
	warn: {
		fg: "var(--status-warning)",
		bg: "color-mix(in srgb, var(--status-warning) 10%, transparent)",
		line: "color-mix(in srgb, var(--status-warning) 32%, transparent)",
	},
	err: {
		fg: "var(--status-failed)",
		bg: "color-mix(in srgb, var(--status-failed) 10%, transparent)",
		line: "color-mix(in srgb, var(--status-failed) 32%, transparent)",
	},
	accent: {
		fg: "var(--accent-text)",
		bg: "color-mix(in srgb, var(--accent) 12%, transparent)",
		line: "color-mix(in srgb, var(--accent) 32%, transparent)",
	},
	muted: { fg: "var(--fg-muted)", bg: "var(--surface)", line: "var(--border-strong)" },
};
