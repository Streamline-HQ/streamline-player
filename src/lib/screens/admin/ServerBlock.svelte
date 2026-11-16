<script lang="ts">
import type { Block } from "#lib/core/server-view.ts";
import type { Handlers } from "#lib/screens/admin/handlers.ts";
import ItemRow from "#lib/screens/admin/ItemRow.svelte";
import NoteRow from "#lib/screens/admin/NoteRow.svelte";
import PairRow from "#lib/screens/admin/PairRow.svelte";
import SettingRow from "#lib/screens/admin/SettingRow.svelte";
import StreamRow from "#lib/screens/admin/StreamRow.svelte";
import Tiles from "#lib/screens/admin/Tiles.svelte";
import Icon, { type IconName } from "#lib/ui/Icon.svelte";

let {
	block,
	h,
	drafts,
}: {
	block: Block;
	h: Handlers;
	drafts: Record<string, string>;
} = $props();
</script>

<div class="block">
	{#if block.cap}
		<div class="cap">{block.cap}</div>
	{/if}
	{#if block.title}
		<div class="head">
			<span class="titles">
				<h3 class:danger={block.danger}>{block.title}</h3>
				{#if block.desc}
					<p>{block.desc}</p>
				{/if}
			</span>
			{#if block.button}
				{@const b = block.button}
				<button type="button" class="action" onclick={() => h.act?.(b.act)}>
					<Icon name={b.icon as IconName} size={14} stroke={2} />{b.label}
				</button>
			{/if}
		</div>
	{/if}
	<div class="rows" class:bare={block.bare} class:danger={block.danger}>
		{#each block.rows as row, i (i)}
			<div class="row" class:flush={row.t === "tiles"}>
				{#if row.t === "tiles"}
					<Tiles tiles={row.tiles} ongo={h.go} />
				{:else if row.t === "stream"}
					<StreamRow {row} onact={h.act} />
				{:else if row.t === "pair"}
					<PairRow {row} onact={h.act} />
				{:else if row.t === "note"}
					<NoteRow {row} onact={h.act} />
				{:else if row.t === "item"}
					<ItemRow {row} onact={h.act} />
				{:else}
					<SettingRow {row} draft={"key" in row ? drafts[row.key] : undefined} {h} />
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
.block {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.cap {
	padding: 0 4px;
	font: 500 10px var(--font-mono);
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--fg-faint);
}

.head {
	display: flex;
	align-items: flex-end;
	gap: 12px;
	padding: 0 4px;
}

.titles {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px;
}

h3 {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	letter-spacing: -0.015em;
	line-height: 1.3;
}

h3.danger {
	color: var(--status-failed);
}

p {
	margin: 0;
	max-width: 640px;
	font-size: 13px;
	line-height: 1.5;
	color: var(--fg-subtle);
	text-wrap: pretty;
}

.action {
	flex: none;
	height: 32px;
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 0 11px;
	border-radius: 9px;
	border: 1px solid var(--border-strong);
	background: transparent;
	color: var(--fg);
	font: inherit;
	font-size: 12.5px;
	font-weight: 500;
	cursor: pointer;
	white-space: nowrap;
}

.action:hover {
	background: var(--surface-2);
}

.rows {
	flex: 1;
	min-width: 0;
	border-radius: var(--radius-lg);
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	overflow: hidden;
}

.rows.bare {
	background: transparent;
	border-color: transparent;
}

.rows.danger {
	border-color: color-mix(in srgb, var(--status-failed) 28%, transparent);
}

.row {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 15px 20px;
}

.row + .row {
	border-top: 1px solid var(--border);
}

.row.flush {
	padding: 0;
}
</style>
