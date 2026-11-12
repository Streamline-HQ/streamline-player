<script lang="ts">
import { ChevronDown } from "@lucide/svelte";

type Group = {
	label: string;
	values: { value: string; label: string }[];
	current: string;
	enabled: boolean;
	onpick: (value: string) => void;
};

let {
	title,
	summary,
	note,
	open,
	groups,
	ontoggle,
}: {
	title: string;
	summary: string;
	note: string;
	open: boolean;
	groups: Group[];
	ontoggle: () => void;
} = $props();
</script>

<div class="style-box">
	<button type="button" class="style-head" aria-expanded={open} onclick={ontoggle}>
		<span class="eyebrow">{title}</span>
		<span class="summary">{summary}</span>
		<span class="chevron" style:transform={open ? "rotate(180deg)" : "none"}
			><ChevronDown size={15} strokeWidth={2} /></span
		>
	</button>
	{#if open}
		{#if note}
			<div class="note">{note}</div>
		{/if}
		{#each groups as g (g.label)}
			{@const idx = g.values.findIndex((v) => v.value === g.current)}
			<div class="style-row" style:opacity={g.enabled ? 1 : 0.42}>
				<span class="label">{g.label}</span>
				<div class="seg-box" style:pointer-events={g.enabled ? "auto" : "none"}>
					<span
						class="seg-ind"
						aria-hidden="true"
						style:width="calc((100% - {6 + (g.values.length - 1) * 4}px) / {g.values.length})"
						style:transform="translateX(calc({Math.max(0, idx)} * (100% + 4px)))"
						style:background={g.enabled ? "var(--player-accent)" : "var(--surface-2)"}
						style:opacity={idx < 0 ? 0 : 1}
					></span>
					{#each g.values as v (v.value)}
						<button
							type="button"
							class="seg-opt"
							disabled={!g.enabled}
							aria-pressed={g.current === v.value}
							style:color={g.current === v.value && g.enabled
								? "var(--fg-on-accent)"
								: "var(--player-ink-muted)"}
							onclick={() => g.onpick(v.value)}
						>
							{v.label}
						</button>
					{/each}
				</div>
			</div>
		{/each}
	{/if}
</div>

<style>
.style-box {
	margin: 8px 4px 2px;
	padding-top: 4px;
	border-top: 1px solid var(--border);
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.style-head {
	width: 100%;
	min-height: 38px;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 0 2px;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: var(--player-ink);
	text-align: left;
	cursor: pointer;
}

.eyebrow {
	flex: none;
	font: 500 10.5px var(--font-mono);
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--fg-faint);
}

.summary {
	flex: 1;
	min-width: 0;
	text-align: right;
	font: 400 11.5px var(--font-mono);
	color: var(--fg-subtle);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.chevron {
	flex: none;
	display: grid;
	color: var(--fg-subtle);
	transition: transform var(--dur-base) var(--ease);
}

.note {
	margin-top: -4px;
	font-size: 11.5px;
	line-height: 1.45;
	color: var(--fg-subtle);
	text-wrap: pretty;
}

.style-row {
	display: flex;
	align-items: center;
	gap: 10px;
	transition: opacity var(--dur-base);
}

.label {
	width: 84px;
	font-size: 12.5px;
	color: var(--fg-subtle);
}

.seg-box {
	position: relative;
	flex: 1;
	display: flex;
	gap: 4px;
	padding: 3px;
	border-radius: 9px;
	background: var(--surface);
}

.seg-ind {
	position: absolute;
	left: 3px;
	top: 3px;
	bottom: 3px;
	border-radius: 7px;
	transition:
		transform var(--dur-slow) var(--ease),
		background-color var(--dur-base),
		opacity var(--dur-base);
}

.seg-opt {
	position: relative;
	flex: 1;
	height: 30px;
	border: 0;
	border-radius: 7px;
	background: transparent;
	font-size: 12.5px;
	font-weight: 500;
	cursor: pointer;
	transition: color var(--dur-base);
}

.seg-opt:disabled {
	cursor: default;
}
</style>
