<script lang="ts">
import type { Act, Row, Tone } from "#lib/core/server-view.ts";
import { TONES } from "#lib/screens/admin/tone.ts";
import Icon, { type IconName } from "#lib/ui/Icon.svelte";

let { row, onact }: { row: Extract<Row, { t: "note" }>; onact?: (a: Act) => void } = $props();

const ICONS: Record<Tone, IconName> = {
	ok: "circle-check",
	warn: "triangle-alert",
	err: "circle-alert",
	muted: "info",
	accent: "info",
};
const tone = $derived(TONES[row.tone]);
</script>

<div
	class="note"
	style:color={row.tone === "muted" ? "var(--fg-muted)" : tone.fg}
	style:background={tone.bg}
	style:border-color={tone.line}
>
	<Icon name={ICONS[row.tone]} size={15} stroke={2} />
	<span class="text">{row.text}</span>
	{#if row.button}
		{@const [label, act] = row.button}
		<button type="button" disabled={row.disabled} onclick={() => onact?.(act)}>
			{label}
		</button>
	{/if}
</div>

<style>
.note {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
	padding: 11px 12px;
	border-radius: var(--radius-md);
	border: 1px solid;
	font-size: 12.5px;
	line-height: 1.5;
}

.note :global(.sl-ico) {
	flex: none;
}

.text {
	flex: 1 1 200px;
	min-width: 0;
	text-wrap: pretty;
}

button {
	flex: none;
	height: 30px;
	padding: 0 11px;
	border-radius: 8px;
	border: 1px solid currentColor;
	background: transparent;
	color: inherit;
	font: inherit;
	font-size: 12.5px;
	font-weight: 600;
	cursor: pointer;
}

button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
</style>
