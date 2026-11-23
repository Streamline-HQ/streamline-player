<script lang="ts">
import Tip from "#lib/ui/Tip.svelte";
import Icon from "#lib/ui/Icon.svelte";

type Look = {
	icon: "arrow-down-to-line" | "circle-arrow-down" | null;
	tone: "muted" | "accent" | "progress";
	pct: number;
};

let {
	look,
	label,
	variant,
	onclick,
}: {
	look: Look;
	label: string;
	variant: "hero" | "round" | "bar" | "poster" | "row";
	onclick: (e: MouseEvent) => void;
} = $props();

const SIZES = {
	hero: { ring: 22, hole: 16, icon: 19, stroke: 1.9 },
	round: { ring: 20, hole: 14, icon: 18, stroke: 1.8 },
	bar: { ring: 20, hole: 14, icon: 18, stroke: 1.8 },
	poster: { ring: 18, hole: 12, icon: 17, stroke: 1.8 },
	row: { ring: 17, hole: 11, icon: 16, stroke: 1.8 },
};
const size = $derived(SIZES[variant]);
</script>

<button
	type="button"
	class="dl {variant} {look.tone}"
	data-state={look.tone}
	aria-label={label}
	{onclick}
>
	<Tip text={label} />
	{#if look.icon}
		<Icon name={look.icon} size={size.icon} stroke={size.stroke} />
	{:else}
		<span class="ring" style:--p="{look.pct}%" style:--d="{size.ring}px" style:--h="{size.hole}px">
			<span class="hole"></span>
		</span>
	{/if}
</button>

<style>
.dl {
	flex: none;
	display: grid;
	place-items: center;
	padding: 0;
	cursor: pointer;
	color: var(--fg-muted);
}

.dl.accent {
	color: var(--accent);
}

.dl.progress {
	color: var(--accent-text);
}

.round,
.bar,
.poster {
	border: 0;
	border-radius: 50%;
	background: transparent;
}

.round,
.bar {
	width: 40px;
	height: 40px;
}

.round {
	margin: -8px -8px -8px 0;
}

.poster {
	width: 34px;
	height: 34px;
}

.row {
	width: 32px;
	height: 32px;
}

.poster,
.row {
	border: 0;
	border-radius: 50%;
	background: transparent;
	pointer-events: auto;
	z-index: 1;
	color: var(--fg-subtle);
}

.poster.accent,
.row.accent {
	color: var(--accent);
}

.poster.progress,
.row.progress {
	color: var(--accent-text);
}

.round:hover,
.bar:hover,
.poster:hover,
.row:hover {
	background: var(--surface-2);
}

.hero {
	width: 46px;
	height: 46px;
	border: 1px solid rgba(255, 255, 255, 0.16);
	border-radius: var(--radius-md);
	background: var(--player-chip);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
}

.hero:hover {
	background: rgba(255, 255, 255, 0.14);
}

.ring {
	width: var(--d);
	height: var(--d);
	display: grid;
	place-items: center;
	border-radius: 50%;
	background: conic-gradient(var(--accent) var(--p), rgb(var(--fg-rgb) / 14%) 0);
}

.hole {
	width: var(--h);
	height: var(--h);
	border-radius: 50%;
	background: var(--bg-deep);
}

.hero .hole {
	background: var(--bg-card);
}
</style>
