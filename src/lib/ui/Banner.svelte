<script lang="ts">
import Icon, { type IconName } from "#lib/ui/Icon.svelte";

let {
	status,
	icon,
	title,
	detail,
}: { status: "paused" | "failed" | "wanted"; icon: IconName; title: string; detail?: string } =
	$props();
</script>

<div class="banner" style:--c="var(--status-{status})" style:--c-rgb="var(--status-{status}-rgb)">
	<Icon name={icon} />
	<div>
		<div class="t">{title}</div>
		{#if detail}
			<div class="d">{detail}</div>
		{/if}
	</div>
</div>

<style>
.banner {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 12px 16px;
	border: 1px solid rgb(var(--c-rgb) / 30%);
	border-radius: var(--radius-lg);
	background: rgb(var(--c-rgb) / 10%);
	font-size: 14px;
	color: var(--c);
}

.banner > :global(.sl-ico) {
	margin-top: 2px;
	font-size: 16px;
}

.t {
	font-weight: 600;
}

.d {
	margin-top: 2px;
	font-size: 12px;
	color: var(--fg-muted);
}
</style>
