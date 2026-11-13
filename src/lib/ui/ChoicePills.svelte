<script lang="ts">
const GAP = 3;

let {
	options,
	value,
	label,
	disabled = false,
	onchange,
}: {
	options: [string, string][];
	value: string;
	label: string;
	disabled?: boolean;
	onchange: (value: string) => void;
} = $props();

const index = $derived(
	Math.max(
		0,
		options.findIndex(([v]) => v === value),
	),
);
</script>

<fieldset class="filters" aria-label={label} {disabled}>
	<span
		class="pill"
		style:width="calc((100% - {2 * GAP + GAP * (options.length - 1)}px) / {options.length})"
		style:transform="translateX(calc({index} * (100% + {GAP}px)))"
	></span>
	{#each options as [v, text] (v)}
		<button
			type="button"
			class:on={v === value}
			aria-pressed={v === value}
			{disabled}
			onclick={() => onchange(v)}
		>
			{text}
		</button>
	{/each}
</fieldset>

<style>
.filters {
	margin: 0;
	min-inline-size: 0;
	position: relative;
	display: grid;
	grid-auto-flow: column;
	grid-auto-columns: 1fr;
	gap: 3px;
	padding: 3px;
	border-radius: 9px;
	background: var(--bg-deep);
	border: 1px solid var(--border);
}

.filters:disabled {
	opacity: 0.5;
}

.pill {
	position: absolute;
	top: 3px;
	bottom: 3px;
	left: 3px;
	border-radius: 7px;
	background: var(--bg-selected);
	transition: transform 240ms var(--ease);
}

button {
	position: relative;
	height: 30px;
	padding: 0 12px;
	border: 0;
	border-radius: 7px;
	background: transparent;
	transition: color 180ms;
	color: var(--fg-subtle);
	font-size: 12.5px;
	font-weight: 500;
	cursor: pointer;
	white-space: nowrap;
}

button:hover:not(:disabled),
button.on {
	color: var(--fg);
}

button:disabled {
	cursor: default;
}
</style>
