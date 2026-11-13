<script lang="ts">
import type { Row, SectionKey } from "#lib/core/server-view.ts";
import { TONES } from "#lib/screens/admin/tone.ts";
import Icon, { type IconName } from "#lib/ui/Icon.svelte";

let {
	tiles,
	ongo,
}: {
	tiles: Extract<Row, { t: "tiles" }>["tiles"];
	ongo?: (to: SectionKey) => void;
} = $props();

const min = $derived(tiles.some((t) => t.mono) ? 300 : 180);
</script>

{#snippet body(t: (typeof tiles)[number])}
	<span class="top">
		<Icon name={t.icon as IconName} size={15} stroke={1.75} />
		<span class="label">{t.label}</span>
		<span class="dot" style:background={TONES[t.tone].fg}></span>
	</span>
	<span class="value" class:mono={t.mono}>{t.value}</span>
	{#if t.pct !== undefined}
		<span class="meter"
			><span style:width="{t.pct}%" style:background={TONES[t.tone].fg}></span></span
		>
	{/if}
	<span class="sub">{t.sub}</span>
{/snippet}

<div class="tiles" style:grid-template-columns="repeat(auto-fit, minmax({min}px, 1fr))">
	{#each tiles as t (t.label)}
		{#if t.go}
			<button type="button" class="tile go" onclick={() => ongo?.(t.go!)}>{@render body(t)}</button>
		{:else}
			<div class="tile">{@render body(t)}</div>
		{/if}
	{/each}
</div>

<style>
.tiles {
	display: grid;
	gap: 10px;
}

.tile {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 14px 16px;
	border-radius: 14px;
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	color: var(--fg);
	font: inherit;
	text-align: left;
	cursor: default;
	transition: border-color var(--dur-fast);
}

.tile.go {
	cursor: pointer;
}

.tile.go:hover {
	border-color: var(--accent-line);
}

.top {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--fg-subtle);
}

.top :global(.sl-ico) {
	flex: none;
}

.label {
	flex: 1;
	min-width: 0;
	font: 500 10px var(--font-mono);
	letter-spacing: 0.14em;
	text-transform: uppercase;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.dot {
	flex: none;
	width: 7px;
	height: 7px;
	border-radius: 50%;
}

.value {
	font-size: 22px;
	font-weight: 600;
	letter-spacing: -0.01em;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.value.mono {
	font-family: var(--font-mono);
	font-size: 13px;
	font-weight: 400;
}

.meter {
	height: 4px;
	border-radius: var(--radius-full);
	background: rgba(255, 255, 255, 0.08);
	overflow: hidden;
}

.meter span {
	display: block;
	height: 100%;
	border-radius: var(--radius-full);
}

.sub {
	font-size: 12px;
	line-height: 1.45;
	color: var(--fg-subtle);
}
</style>
