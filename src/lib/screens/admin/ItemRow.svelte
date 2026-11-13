<script lang="ts">
import type { Act, Row } from "#lib/core/server-view.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import { TONES } from "#lib/screens/admin/tone.ts";
import Button from "#lib/ui/Button.svelte";
import Icon, { type IconName } from "#lib/ui/Icon.svelte";

let { row, onact }: { row: Extract<Row, { t: "item" }>; onact?: (a: Act) => void } = $props();
</script>

<div class="item">
	<span class="icon"><Icon name={row.icon as IconName} size={18} stroke={1.75} /></span>
	<span class="text">
		<span class="head">
			<span class="title">{row.title}</span>
			{#each row.pills as [label, tone] (label)}
				<span
					class="pill"
					style:color={TONES[tone].fg}
					style:background={TONES[tone].bg}
					style:border-color={TONES[tone].line}
					>{label}</span
				>
			{/each}
		</span>
		<span class="meta">{row.meta}</span>
		{#if row.progress !== undefined}
			<div
				class="sl-progress"
				role="progressbar"
				aria-label={i18n.server_scan_progress_label({ name: row.title })}
				aria-valuenow={Math.round(row.progress * 100)}
				aria-valuemin="0"
				aria-valuemax="100"
			>
				<div class="sl-progress__fill" style:width="{row.progress * 100}%"></div>
			</div>
		{/if}
	</span>
	{#if row.aside}
		<span class="aside" style:color={row.asideTone ? TONES[row.asideTone].fg : "var(--fg-subtle)"}>
			{row.aside}
		</span>
	{/if}
	{#if row.buttons.length}
		<span class="btns">
			{#each row.buttons as b (b.label)}
				<Button
					variant={b.tone === "danger" ? "destructive" : "secondary"}
					size="sm"
					disabled={b.disabled}
					onclick={() => onact?.(b.act)}
				>
					{b.label}
				</Button>
			{/each}
		</span>
	{/if}
</div>

<style>
.item {
	display: flex;
	align-items: center;
	gap: 10px 14px;
	flex-wrap: wrap;
}

.icon {
	flex: none;
	width: 38px;
	height: 38px;
	border-radius: var(--radius-md);
	display: grid;
	place-items: center;
	background: var(--bg-deep);
	border: 1px solid var(--border);
	color: var(--accent-text);
}

.text {
	flex: 1 1 200px;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.head {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.title {
	font-size: 14px;
	font-weight: 500;
}

.pill {
	height: 20px;
	display: inline-flex;
	align-items: center;
	padding: 0 7px;
	border-radius: var(--radius-sm);
	border: 1px solid;
	font: 500 10.5px var(--font-mono);
}

.meta {
	font: 400 11.5px var(--font-mono);
	line-height: 1.5;
	color: var(--fg-subtle);
	overflow-wrap: anywhere;
}

.sl-progress {
	margin-top: 5px;
}

.sl-progress__fill {
	transition: width 500ms linear;
}

.aside {
	flex: none;
	font: 400 12px var(--font-mono);
}

.btns {
	flex: none;
	display: flex;
	gap: 6px;
}
</style>
