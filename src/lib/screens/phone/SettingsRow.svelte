<script lang="ts">
import Icon, { type IconName } from "#lib/ui/Icon.svelte";
import type { Snippet } from "svelte";

let {
	label,
	desc,
	icon,
	control,
	below,
}: {
	label: string;
	desc?: string;
	icon?: IconName;
	control?: Snippet;
	below?: Snippet;
} = $props();
</script>

<div class="row">
	<div class="line">
		{#if icon}
			<span class="icon"><Icon name={icon} size={18} stroke={1.75} /></span>
		{/if}
		<span class="text">
			<span class="label">{label}</span>
			{#if desc}
				<span class="desc">{desc}</span>
			{/if}
		</span>
		{@render control?.()}
	</div>
	{@render below?.()}
</div>

<style>
.row {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 13px 16px;
	border-bottom: 1px solid var(--border);
}

.row:last-child {
	border-bottom: 0;
}

.line {
	display: flex;
	align-items: center;
	gap: 12px;
	min-height: 22px;
}

.icon {
	flex: none;
	width: 36px;
	height: 36px;
	border-radius: var(--radius-md);
	display: grid;
	place-items: center;
	background: var(--bg-deep);
	color: var(--accent-text);
}

.text {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.label {
	font-size: 15px;
	color: var(--fg);
}

.desc {
	font-size: 12px;
	line-height: 1.45;
	color: var(--fg-subtle);
}
</style>
