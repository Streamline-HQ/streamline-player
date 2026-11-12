<script lang="ts">
import { X } from "@lucide/svelte";
import type { StatRow } from "#lib/core/player-panels.ts";

let {
	title,
	closeLabel,
	rows,
	onclose,
}: { title: string; closeLabel: string; rows: StatRow[]; onclose: () => void } = $props();

const pop = (_: Element) => ({
	duration: 220,
	css: (t: number) =>
		`opacity:${t};transform:translateY(${(1 - t) * -6}px) scale(${0.98 + 0.02 * t})`,
});
</script>

<div class="sl-stats" in:pop|global out:pop|global>
	<div class="head">
		<span>{title}</span>
		<button type="button" class="close" aria-label={closeLabel} onclick={onclose}>
			<X size={14} strokeWidth={2} />
		</button>
	</div>
	{#each rows as r}
		<div class="stats-row">
			<span>{r.label}</span
			><span
				class:why={r.why}
				style:color={r.why ? "var(--fg-subtle)" : (r.color ?? "var(--player-ink-muted)")}
				>{r.value}</span
			>
		</div>
	{/each}
</div>

<style>
.sl-stats {
	position: absolute;
	right: 28px;
	top: 66px;
	width: 440px;
	padding: 14px 16px;
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: var(--radius-player-controls);
	background: rgba(5, 5, 8, 0.78);
	backdrop-filter: blur(14px);
	-webkit-backdrop-filter: blur(14px);
	font: 400 11.5px / 1.65 var(--font-mono);
	color: var(--player-ink-muted);
	transform-origin: 100% 0;
}

.head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 8px;
	font-size: 10.5px;
	font-weight: 600;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--player-ink);
}

.close {
	width: 26px;
	height: 26px;
	display: grid;
	place-items: center;
	border: 0;
	border-radius: var(--radius-sm);
	background: transparent;
	color: var(--fg-subtle);
	cursor: pointer;
}

.close:hover {
	color: var(--player-ink);
}

.stats-row {
	display: grid;
	grid-template-columns: 96px minmax(0, 1fr);
	gap: 10px;
}

.stats-row > span:first-child {
	color: var(--fg-faint);
}

.stats-row > span:last-child {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.stats-row > span.why {
	white-space: normal;
	text-wrap: pretty;
}
</style>
