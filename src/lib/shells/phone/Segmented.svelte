<script lang="ts">
const GAP = 3;

let {
	options,
	value,
	label,
	height = 34,
	onchange,
}: {
	options: { value: string; label: string }[];
	value: string;
	label: string;
	height?: number;
	onchange: (value: string) => void;
} = $props();

const index = $derived(
	Math.max(
		0,
		options.findIndex((o) => o.value === value),
	),
);
</script>

<fieldset class="seg" aria-label={label}>
	<span
		class="pill"
		style:width="calc((100% - {2 * GAP + (options.length - 1) * GAP}px) / {options.length})"
		style:transform="translateX(calc({index} * (100% + {GAP}px)))"
	></span>
	{#each options as o (o.value)}
		<button
			type="button"
			class:on={o.value === value}
			aria-pressed={o.value === value}
			style:height="{height}px"
			onclick={() => onchange(o.value)}
		>
			{o.label}
		</button>
	{/each}
</fieldset>

<style>
.seg {
	margin: 0;
	min-inline-size: 0;
	border: 0;
	position: relative;
	display: grid;
	grid-auto-flow: column;
	grid-auto-columns: 1fr;
	gap: 3px;
	padding: 3px;
	border-radius: var(--radius-md);
	background: var(--bg-deep);
}

.pill {
	position: absolute;
	top: 3px;
	bottom: 3px;
	left: 3px;
	border-radius: 8px;
	background: var(--bg-selected);
	transition: transform 240ms var(--ease);
}

button {
	position: relative;
	min-width: 0;
	padding: 0 4px;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: var(--fg-subtle);
	font-size: 13px;
	font-weight: 500;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	cursor: pointer;
	transition: color 180ms;
}

button.on {
	color: var(--fg);
}
</style>
