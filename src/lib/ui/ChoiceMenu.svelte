<script lang="ts">
import { dismiss } from "#lib/ui/dismiss.ts";
import Icon from "#lib/ui/Icon.svelte";
import { presence } from "#lib/ui/presence.svelte.ts";

type Option = { value: string; label: string };

let {
	label,
	options,
	value,
	select = false,
	onchange,
}: {
	label: string;
	options: Option[];
	value: string;
	select?: boolean;
	onchange: (value: string) => void;
} = $props();

const at = $derived(
	Math.max(
		0,
		options.findIndex((o) => o.value === value),
	),
);

let open = $state(false);
let trigger = $state<HTMLElement>();
let place = $state({ left: 0, top: 0 });
const panel = presence(() => open, 170);

// Fixed to the window, since the settings card clips what overflows it.
function toggle() {
	const box = trigger?.getBoundingClientRect();
	if (box) place = { left: box.left, top: box.bottom + 6 };
	open = !open;
}

function step(e: KeyboardEvent & { currentTarget: HTMLElement }) {
	if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
	e.preventDefault();
	const opts = [...e.currentTarget.querySelectorAll<HTMLElement>(".opt")];
	const from = opts.indexOf(document.activeElement as HTMLElement);
	opts[(from + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length]?.focus();
}
</script>

<svelte:window onscrollcapture={() => (open = false)} onresize={() => (open = false)} />

{#if select}
	<div class="drop" use:dismiss={() => (open = false)}>
		<button
			type="button"
			class="pick"
			bind:this={trigger}
			aria-label={label}
			aria-haspopup="listbox"
			aria-expanded={open}
			data-value={value}
			onclick={toggle}
		>
			<span class="current">{options[at]?.label}</span>
			<span class="chev" class:open><Icon name="chevron-down" size={14} stroke={2} /></span>
		</button>
		{#if panel.mounted}
			<div
				class="list"
				class:shown={panel.shown && open}
				role="listbox"
				tabindex="-1"
				aria-label={label}
				style:left="{place.left}px"
				style:top="{place.top}px"
				onkeydown={step}
			>
				{#each options as o (o.value)}
					<button
						type="button"
						role="option"
						aria-selected={o.value === value}
						class="opt"
						onclick={() => {
							onchange(o.value);
							open = false;
							trigger?.focus();
						}}
					>
						<span class="check"><Icon name="tick" size={14} stroke={2.5} /></span>{o.label}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{:else}
	<fieldset class="group" aria-label={label}>
		<span
			class="pill"
			style:width="calc((100% - {6 + 3 * (options.length - 1)}px) / {options.length})"
			style:transform="translateX(calc({at} * (100% + 3px)))"
		></span>
		{#each options as o (o.value)}
			<button type="button" aria-pressed={o.value === value} onclick={() => onchange(o.value)}>
				{o.label}
			</button>
		{/each}
	</fieldset>
{/if}

<style>
.drop {
	flex: none;
}

.pick {
	width: 172px;
	height: 36px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 0 10px 0 12px;
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	background: var(--bg-card);
	color: var(--fg);
	font: 400 13px var(--font-sans);
	cursor: pointer;
}

.pick:hover {
	border-color: var(--border-strong);
}

.pick:focus-visible {
	outline: none;
	border-color: var(--accent);
	box-shadow: 0 0 0 2px var(--accent-ring);
}

.current {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.chev {
	display: grid;
	color: var(--fg-subtle);
	transition: transform var(--dur-base) var(--ease);
}

.chev.open {
	transform: rotate(180deg);
}

.list {
	position: fixed;
	z-index: 20;
	width: 172px;
	padding: 6px;
	box-sizing: border-box;
	border-radius: 12px;
	background: var(--bg-elevated);
	border: 1px solid var(--border-strong);
	box-shadow: var(--shadow-4);
	transform-origin: top;
	opacity: 0;
	transform: translateY(-6px) scale(0.97);
	pointer-events: none;
	transition:
		opacity 130ms var(--ease-in),
		transform 150ms var(--ease-in);
}

.list.shown {
	opacity: 1;
	transform: translateY(0) scale(1);
	pointer-events: auto;
	transition:
		opacity 160ms var(--ease),
		transform 220ms var(--ease);
}

.opt {
	position: static;
	width: 100%;
	height: 34px;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 0 10px;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: var(--fg);
	font-size: 13px;
	font-weight: 400;
	text-align: left;
	cursor: pointer;
}

.opt:hover,
.opt:focus-visible {
	background: var(--surface-2);
	outline: none;
}

.check {
	width: 14px;
	display: grid;
	color: var(--accent);
	opacity: 0;
}

[aria-selected="true"] > .check {
	opacity: 1;
}

.group {
	position: relative;
	flex: none;
	max-width: 100%;
	box-sizing: border-box;
	display: grid;
	grid-auto-flow: column;
	grid-auto-columns: 1fr;
	gap: 3px;
	margin: 0;
	min-width: 0;
	padding: 3px;
	border-radius: 9px;
	background: var(--bg-deep);
	border: 1px solid var(--border);
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

.group button {
	position: relative;
	height: 28px;
	padding: 0 11px;
	border: 0;
	border-radius: 7px;
	background: transparent;
	color: var(--fg-subtle);
	font-size: 12.5px;
	font-weight: 500;
	white-space: nowrap;
	cursor: pointer;
	transition: color 180ms;
}

.group button:hover {
	color: var(--fg);
}

.group button[aria-pressed="true"] {
	color: var(--fg);
}

.group button:focus-visible {
	outline: 2px solid var(--accent-ring);
	outline-offset: -2px;
}
</style>
