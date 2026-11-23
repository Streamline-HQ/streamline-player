<script lang="ts" generics="V extends string">
import { dismiss } from "#lib/ui/dismiss.ts";
import Icon, { type IconName } from "#lib/ui/Icon.svelte";
import { presence } from "#lib/ui/presence.svelte.ts";

let {
	options,
	value,
	label,
	icon = "arrow-up-down",
	title,
	current: currentLabel,
	ascending,
	align = "right",
	onchange,
}: {
	options: { value: V; label: string; icon?: IconName }[];
	value: V;
	label: string;
	icon?: IconName;
	/** What the button reads in place of the chosen option, for a choice that means "no filter". */
	title?: string;
	/** What the button reads when the value is none of the options (a sort picked from a column head). */
	current?: string;
	/** Set for a sort: the chosen option shows the direction instead of a tick. */
	ascending?: boolean;
	align?: "left" | "right";
	onchange: (value: V) => void;
} = $props();

let open = $state(false);
const panel = presence(() => open, 170);
const current = $derived(options.find((o) => o.value === value)?.label ?? currentLabel ?? "");
</script>

<div class="sort" use:dismiss={() => (open = false)}>
	<button
		type="button"
		class="trigger"
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<Icon name={icon} size={15} stroke={1.75} />{title ?? current}
		<span class="chev" class:open><Icon name="chevron-down" size={13} stroke={2} /></span>
	</button>
	{#if panel.mounted}
		<div class="menu {align}" class:shown={panel.shown && open} role="menu" aria-label={label}>
			{#each options as o (o.value)}
				<button
					type="button"
					role="menuitemradio"
					aria-checked={value === o.value}
					class="opt"
					onclick={() => {
						onchange(o.value);
						open = false;
					}}
				>
					{#if o.icon}
						<span class="lead"><Icon name={o.icon} size={15} stroke={1.75} /></span>
					{/if}
					<span class="label">{o.label}</span>
					<span class="check" class:up={ascending === true}
						><Icon
							name={ascending === undefined ? "tick" : "chevron-down"}
							size={14}
							stroke={2.5}
						/></span
					>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
.sort {
	position: relative;
}

.trigger {
	height: 36px;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 0 10px 0 12px;
	border: 0;
	border-radius: 10px;
	box-shadow: inset 0 0 0 1px var(--border);
	background: rgb(var(--fg-rgb) / 4%);
	color: var(--fg-muted);
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	white-space: nowrap;
	transition:
		background var(--dur-fast),
		color var(--dur-fast);
}

.trigger:hover {
	background: rgb(var(--fg-rgb) / 8%);
	color: var(--fg);
}

.chev {
	display: grid;
	color: var(--fg-subtle);
	transition: transform var(--dur-base) var(--ease);
}

.chev.open {
	transform: rotate(180deg);
}

.menu {
	position: absolute;
	top: 44px;
	z-index: 5;
	width: 200px;
	padding: 6px;
	box-sizing: border-box;
	border-radius: 12px;
	background: var(--bg-elevated);
	border: 1px solid var(--border-strong);
	box-shadow: var(--shadow-4);
	transform-origin: top right;
	opacity: 0;
	transform: translateY(-6px) scale(0.97);
	pointer-events: none;
	transition:
		opacity 130ms var(--ease-in),
		transform 150ms var(--ease-in);
}

.menu.right {
	right: 0;
}

.menu.left {
	left: 0;
	transform-origin: top left;
}

.menu.shown {
	opacity: 1;
	transform: translateY(0) scale(1);
	pointer-events: auto;
	transition:
		opacity 160ms var(--ease),
		transform 220ms var(--ease);
}

.opt {
	width: 100%;
	height: 36px;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 0 10px;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: var(--fg);
	font-size: 13px;
	text-align: left;
	cursor: pointer;
}

.opt:hover {
	background: var(--surface-2);
}

.lead {
	display: grid;
	color: var(--fg-subtle);
}

[aria-checked="true"] > .lead {
	color: var(--accent-text);
}

.label {
	flex: 1;
}

.check {
	display: grid;
	width: 14px;
	color: var(--accent);
	opacity: 0;
	transition: transform var(--dur-fast) var(--ease);
}

.check.up {
	transform: rotate(180deg);
}

[aria-checked="true"] > .check {
	opacity: 1;
}
</style>
