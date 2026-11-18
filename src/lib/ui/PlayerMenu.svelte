<script lang="ts">
import { Check, LoaderCircle, Moon, X } from "@lucide/svelte";
import type { Row } from "#lib/core/player-panels.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import type { Snippet } from "svelte";

let {
	title,
	rows,
	note,
	night = false,
	sheet = false,
	tabs,
	top = false,
	ontab,
	onpick,
	onclose,
	children,
}: {
	title: string;
	rows: Row[];
	note?: { text: string; color: string };
	night?: boolean;
	sheet?: boolean;
	/** One button covering several panels: the tabs stand in for the title. */
	tabs?: { id: string; label: string; on: boolean }[];
	/** Opens down from under the top bar instead of up from the bottom bar. */
	top?: boolean;
	ontab?: (id: string) => void;
	onpick: (id: string) => void;
	onclose: () => void;
	children?: Snippet;
} = $props();

let panel: HTMLElement;
const stops = () => [...panel.querySelectorAll<HTMLElement>("button:not(:disabled)")];

$effect(() => {
	(panel.querySelector<HTMLElement>(".opt.sel:not(:disabled)") ?? stops()[0])?.focus();
});

function onkeydown(e: KeyboardEvent) {
	// Kept from the player's own shortcuts, which would seek, change the volume or pause.
	if (!["ArrowUp", "ArrowDown", "Enter", " ", "Tab"].includes(e.key)) return;
	e.stopPropagation();
	if (!e.key.startsWith("Arrow")) return;
	e.preventDefault();
	const all = stops();
	const at = all.indexOf(document.activeElement as HTMLElement);
	all[(at + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
}

// Grows out of the bar's buttons, which sit under its bottom right corner.
const pop = (_: Element, { duration = 110 } = {}) => ({
	duration,
	css: (t: number) =>
		top
			? `opacity:${t};transform:translateY(${(1 - t) * -8}px) scale(${0.98 + 0.02 * t})`
			: `opacity:${t};transform:scale(${0.92 + 0.08 * t})`,
});

const slide = (_: Element, { duration = 240 } = {}) => ({
	duration,
	css: (t: number) => `opacity:${t};transform:translateX(${(1 - t) * 24}px)`,
});
const enter = (node: Element, o?: { duration?: number }) => (sheet ? slide(node, o) : pop(node, o));
</script>

<div
	class="menu"
	class:sheet
	class:top
	role="dialog"
	aria-label={title}
	data-menu-panel="1"
	tabindex="-1"
	bind:this={panel}
	{onkeydown}
	in:enter|global
	out:enter|global={{ duration: sheet ? 180 : 80 }}
>
	<div class="head">
		{#if tabs}
			{#each tabs as t (t.id)}
				<button type="button" class="tab" class:on={t.on} onclick={() => ontab?.(t.id)}>
					{t.label}<span class="line"></span>
				</button>
			{/each}
		{:else}
			<span class="title">{title}</span>
		{/if}
		<div class="grow"></div>
		<button type="button" class="close" aria-label={i18n.player_close()} onclick={onclose}>
			<X size={16} strokeWidth={2} />
		</button>
	</div>
	<div class="body">
		{#if note?.text}
			<div class="note">
				<span class="dot" style:background={note.color}></span><span>{note.text}</span>
			</div>
		{/if}
		{#each rows as r (r.id)}
			<button
				type="button"
				class="opt"
				class:sel={r.on}
				disabled={r.disabled}
				style:opacity={r.busy ? 0.62 : r.disabled ? 0.5 : 1}
				onclick={() => onpick(r.id)}
			>
				<span class="check" style:opacity={r.on ? 1 : 0}
					><Check size={16} strokeWidth={2.5} /></span
				>
				<span class="text">
					<span class="label" style:font-weight={r.on ? 600 : 500}
						>{r.label}
						{#if r.pill}
							<span class="pill">{r.pill}</span>
						{/if}</span
					>
					{#if r.sub}
						<span class="sub"
							>{#if r.busy}
								<span class="spin"><LoaderCircle size={11} strokeWidth={2} /></span>
							{/if}
							{r.sub}</span
						>
					{/if}
				</span>
				{#if r.badge}
					<span class="badge {r.tone ?? "ok"}">{r.badge}</span>
				{/if}
			</button>
		{/each}
		{@render children?.()}
		{#if night}
			<div class="night">
				<Moon size={16} strokeWidth={1.75} />
				<span class="night-text"
					><span class="night-title">{i18n.player_night_mode()}</span
					><span>{i18n.player_night_mode_desc()}</span></span
				>
				<span class="night-later">{i18n.player_night_later()}</span>
			</div>
		{/if}
	</div>
</div>

<style>
.menu {
	position: absolute;
	right: 24px;
	bottom: 100px;
	width: 380px;
	max-height: calc(100% - 172px);
	display: flex;
	flex-direction: column;
	border-radius: 16px;
	background: rgb(17, 17, 25);
	border: 1px solid var(--border-strong);
	box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
	overflow: hidden;
	transform-origin: 100% 100%;
}

.menu.sheet {
	right: 0;
	top: 0;
	bottom: 0;
	width: 360px;
	max-height: none;
	zoom: 0.85;
	border-radius: 0;
	background: rgba(17, 17, 25, 0.94);
	backdrop-filter: blur(28px) saturate(150%);
	-webkit-backdrop-filter: blur(28px) saturate(150%);
	transform-origin: 100% 50%;
}

.menu.top {
	right: 24px;
	top: 70px;
	bottom: auto;
	width: 360px;
	max-height: calc(100% - 190px);
	transform-origin: 100% 0;
}

.head {
	display: flex;
	align-items: center;
	gap: 2px;
	padding: 8px 8px 0;
	border-bottom: 1px solid var(--border);
}

.menu.sheet .head {
	padding-top: calc(8px + env(safe-area-inset-top));
}

.title {
	height: 40px;
	display: flex;
	align-items: center;
	padding: 0 10px;
	font-size: 14px;
	font-weight: 600;
	color: var(--player-ink);
}

.tab {
	position: relative;
	height: 40px;
	padding: 0 11px;
	border: 0;
	border-radius: 8px 8px 0 0;
	background: transparent;
	color: var(--fg-subtle);
	font-size: 13px;
	font-weight: 500;
	white-space: nowrap;
	cursor: pointer;
}

.tab:hover,
.tab.on {
	color: var(--player-ink);
}

.tab.on {
	font-weight: 600;
}

.line {
	position: absolute;
	left: 10px;
	right: 10px;
	bottom: 0;
	height: 2px;
	border-radius: 2px;
	background: var(--player-accent);
	opacity: 0;
}

.tab.on .line {
	opacity: 1;
}

.grow {
	flex: 1;
}

.close {
	width: 34px;
	height: 34px;
	margin-bottom: 4px;
	display: grid;
	place-items: center;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: var(--fg-subtle);
	cursor: pointer;
}

.close:hover {
	color: var(--player-ink);
	background: var(--player-chip);
}

.body {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	padding: 8px;
}

.note {
	display: flex;
	gap: 9px;
	margin: 2px 4px 8px;
	padding: 10px 12px;
	border-radius: var(--radius-md);
	background: var(--surface);
	border: 1px solid var(--border);
	font-size: 12px;
	line-height: 1.5;
	color: var(--player-ink-muted);
}

.dot {
	flex: none;
	width: 7px;
	height: 7px;
	margin-top: 5px;
	border-radius: 50%;
}

.opt {
	width: 100%;
	min-height: 40px;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 5px 10px;
	border: 0;
	border-radius: var(--radius-md);
	background: transparent;
	color: var(--player-ink);
	text-align: left;
	cursor: pointer;
}

.opt:disabled {
	cursor: default;
}

.opt.sel {
	background: color-mix(in srgb, var(--player-accent) 10%, transparent);
}

.opt:hover:not(:disabled),
.opt:focus-visible {
	background: var(--surface-2);
}

.check {
	flex: none;
	width: 18px;
	display: grid;
	place-items: center;
	color: var(--player-accent);
}

.text {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 1px;
}

.label {
	display: flex;
	align-items: center;
	gap: 7px;
	font-size: 14px;
}

.pill {
	padding: 1px 5px;
	border-radius: 4px;
	border: 1px solid var(--border-strong);
	font: 600 9.5px var(--font-mono);
	letter-spacing: 0.06em;
	color: var(--player-ink-muted);
}

.sub {
	display: flex;
	align-items: center;
	gap: 5px;
	font: 400 11px var(--font-mono);
	color: var(--fg-subtle);
}

.spin {
	display: grid;
	animation: spin 1s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.night {
	margin: 10px 4px 2px;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 12px;
	border-radius: var(--radius-md);
	border: 1px dashed var(--border-strong);
	color: var(--fg-subtle);
}

.night-text {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 1px;
	font-size: 11.5px;
	line-height: 1.4;
}

.night-title {
	font-size: 13px;
	font-weight: 500;
	color: var(--player-ink-muted);
}

.night-later {
	flex: none;
	font: 500 10px var(--font-mono);
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--fg-faint);
}

.badge {
	flex: none;
	padding: 2px 7px;
	border-radius: var(--radius-full);
	font: 500 10.5px var(--font-mono);
	border: 1px solid;
}

.badge.ok {
	color: var(--status-available);
	background: color-mix(in srgb, var(--status-available) 12%, transparent);
	border-color: color-mix(in srgb, var(--status-available) 25%, transparent);
}

.badge.conv {
	color: var(--status-downloading);
	background: color-mix(in srgb, var(--status-downloading) 14%, transparent);
	border-color: color-mix(in srgb, var(--status-downloading) 30%, transparent);
}

.badge.warn {
	color: var(--status-warning);
	background: color-mix(in srgb, var(--status-warning) 12%, transparent);
	border-color: color-mix(in srgb, var(--status-warning) 30%, transparent);
}
</style>
