<script lang="ts">
import "#lib/ui/card.css";
import { m as i18n } from "#lib/paraglide/messages.js";
import Art from "#lib/ui/Art.svelte";
import { hold } from "#lib/ui/hold.svelte.ts";
import Icon from "#lib/ui/Icon.svelte";
import Tip from "#lib/ui/Tip.svelte";
import WatchGlyph from "#lib/ui/WatchGlyph.svelte";

type Action = { label: string; onclick: () => void };
type Lang = { own: boolean; label: string; onclick: (trigger: HTMLElement) => void };

let {
	title,
	code,
	sub,
	still,
	position,
	progress,
	left,
	width = 300,
	reset,
	mark,
	oninfo,
	beside,
	lang,
	onclick,
}: {
	title: string;
	code?: string;
	sub?: string;
	still?: string;
	position?: string;
	progress: number;
	left?: string;
	width?: number;
	/** Phone: the three below come up over the still after a long press. */
	reset?: Action;
	mark?: Action & { on: boolean };
	oninfo?: () => void;
	/** Desktop: shown beside the play button while the card is hovered. */
	beside?: Action;
	lang?: Lang;
	onclick: () => void;
} = $props();

const has = $derived(!!(reset || mark || oninfo));
let box = $state<HTMLElement>();
const h = hold(
	() => box,
	() => has,
);
</script>

{#snippet card(open: () => void)}
	<button type="button" class="resume" style:width="{width}px" onclick={open}>
		<span class="art">
			<Art src={still} {position} />
			<span class="shade"></span>
			<span class="play"><Icon name="play" filled size={14} /></span>
			{#if left}
				<span class="left">{left}</span>
			{/if}
			<span class="bar"><span style:width="{progress}%"></span></span>
		</span>
		<span class="text">
			<span class="title"
				>{title}
				{#if code}
					<span class="code">{code}</span>
				{/if}</span
			>
			{#if sub}
				<span class="sub">{sub}</span>
			{/if}
		</span>
	</button>
{/snippet}

{#if has}
	<!-- biome-ignore lint/a11y/useSemanticElements: a <fieldset> brings its own box and legend. -->
	<div
		bind:this={box}
		class="held-box slp-mk--phone slp-resume"
		role="group"
		aria-label={title}
		onpointerdown={h.press}
		onpointerup={h.release}
		onpointerleave={h.release}
		onpointercancel={h.cancel}
		oncontextmenu={(e) => e.preventDefault()}
	>
		{@render card(() => h.tap(onclick))}
		<span class="slp-hover" class:slp-hover--on={h.held}>
			{#if reset}
				<button type="button" class="slp-glass" aria-label={reset.label} onclick={reset.onclick}>
					<Icon name="rotate-ccw" />
				</button>
			{/if}
			{#if mark}
				<button
					type="button"
					class="slp-glass"
					class:on={mark.on}
					aria-label={mark.label}
					onclick={mark.onclick}
				>
					<WatchGlyph on={mark.on} size={18} stroke={1.9} />
				</button>
			{/if}
			{#if oninfo}
				<button
					type="button"
					class="slp-glass"
					aria-label={i18n.common_more_info()}
					onclick={oninfo}
				>
					<Icon name="info" />
				</button>
			{/if}
		</span>
	</div>
{:else if beside || lang}
	<div class="beside-box">
		{@render card(onclick)}
		<span class="beside" style:width="{width}px">
			{#if beside}
				<button type="button" class="slp-glass" aria-label={beside.label} onclick={beside.onclick}>
					<Tip text={beside.label} />
					<WatchGlyph on={false} size={15} stroke={1.9} />
				</button>
			{/if}
			{#if lang}
				<button
					type="button"
					class="slp-glass"
					class:own={lang.own}
					data-lang-trigger="card"
					aria-label={lang.label}
					onclick={(e) => lang.onclick(e.currentTarget)}
				>
					<Tip text={lang.label} />
					<Icon name="languages" />
				</button>
			{/if}
		</span>
	</div>
{:else}
	{@render card(onclick)}
{/if}

<style>
.held-box {
	flex: none;
	scroll-snap-align: start;
	user-select: none;
	-webkit-user-select: none;
	-webkit-touch-callout: none;
}

.beside-box {
	position: relative;
	flex: none;
	scroll-snap-align: start;
}

/* Laid over the art, which the sibling button draws: buttons cannot nest. */
.beside {
	position: absolute;
	top: 0;
	left: 0;
	aspect-ratio: var(--card-aspect-backdrop);
	display: flex;
	align-items: flex-end;
	gap: 6px;
	padding: 0 0 13px 54px;
	box-sizing: border-box;
	pointer-events: none;
	opacity: 0;
	transition: opacity 180ms var(--ease);
}

.beside > button {
	pointer-events: auto;
}

.beside-box:hover .beside,
.beside-box:focus-within .beside {
	opacity: 1;
}

.resume {
	flex: none;
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 0;
	border: 0;
	background: none;
	color: var(--fg);
	text-align: left;
	cursor: pointer;
	scroll-snap-align: start;
}

.art {
	position: relative;
	display: block;
	aspect-ratio: var(--card-aspect-backdrop);
	overflow: hidden;
	border-radius: var(--radius-player-controls);
	background: var(--bg-card);
	box-shadow: 0 0 0 1px var(--border);
	transition:
		box-shadow var(--dur-fast),
		transform var(--dur-fast);
}

.resume:hover .art,
.beside-box:hover .art {
	box-shadow: var(--shadow-card-hover);
	transform: scale(1.02);
}

.shade {
	position: absolute;
	inset: 0;
	background: linear-gradient(0deg, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0) 45%);
}

.play {
	position: absolute;
	left: 12px;
	bottom: 12px;
	display: grid;
	place-items: center;
	width: 34px;
	height: 34px;
	border-radius: 50%;
	background: rgb(var(--player-ink-rgb) / 92%);
	color: var(--fg-on-accent);
	font-size: 14px;
}

.left {
	position: absolute;
	right: 12px;
	bottom: 14px;
	color: var(--player-ink);
	font: 500 11px var(--font-mono);
	text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.bar {
	position: absolute;
	inset: auto 0 0 0;
	height: 3px;
	background: var(--player-track);
}

.bar > span {
	display: block;
	height: 100%;
	background: var(--player-accent);
}

.text {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.title {
	display: flex;
	align-items: baseline;
	gap: 8px;
	font-size: 14px;
	font-weight: 600;
}

.code {
	font: 500 11px var(--font-mono);
	color: var(--accent-text);
}

.sub {
	font-size: 12.5px;
	color: var(--fg-subtle);
}
</style>
