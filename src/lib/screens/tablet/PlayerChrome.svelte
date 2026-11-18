<script lang="ts">
import { ChevronLeft, Pause, Play, RotateCcw, RotateCw, SkipForward } from "@lucide/svelte";
import type { Segment } from "#lib/core/player-view.ts";
import type { Trickplay } from "#lib/core/trickplay.ts";
import PausedCard from "#lib/ui/PausedCard.svelte";
import Scrubber from "#lib/ui/Scrubber.svelte";
import type { Component } from "svelte";

type Button = {
	id: string;
	icon: Component<{ size?: number; strokeWidth?: number }>;
	label: string;
	active: boolean;
	disabled?: boolean;
	onclick: () => void;
};

let {
	live,
	title,
	sub,
	buttons,
	playing,
	paused,
	pausedEyebrow,
	pausedTitle,
	pausedText,
	pausedLeft,
	scrub,
	current,
	remaining,
	badge,
	badgeDot,
	chapter,
	hasNext,
	labels,
	onback,
	ontoggle,
	onseek,
	onstats,
	onnext,
}: {
	live: boolean;
	title: string;
	sub: string;
	buttons: Button[];
	playing: boolean;
	paused: boolean;
	pausedEyebrow: string;
	pausedTitle: string;
	pausedText: string;
	pausedLeft: string;
	scrub: {
		segs: Segment[];
		chapters: { start: number; end: number; title: string }[];
		position: number;
		buffered: number;
		duration: number;
		still: string;
		trickplay: Trickplay | null;
		label: string;
		onseek: (at: number) => void;
		onhovering: (on: boolean) => void;
		onactivity: () => void;
	};
	current: string;
	remaining: string;
	badge: string;
	badgeDot: string | null;
	chapter: string;
	hasNext: boolean;
	labels: {
		play: string;
		pause: string;
		back: string;
		forward: string;
		backTitle: string;
		stats: string;
		next: string;
	};
	onback: () => void;
	ontoggle: () => void;
	onseek: (delta: number) => void;
	onstats: () => void;
	onnext: () => void;
} = $props();

const events = $derived(live ? "auto" : "none");
</script>

<div class="top left" style:pointer-events={events}>
	<button type="button" class="round back" aria-label={labels.backTitle} onclick={onback}>
		<ChevronLeft size={22} strokeWidth={2} />
	</button>
	<span class="name">{title} <span class="short">· {sub}</span></span>
</div>

<div class="top right" style:pointer-events={events}>
	{#each buttons as b (b.id)}
		<button
			type="button"
			class="round tool"
			data-menu-btn="1"
			class:on={b.active}
			aria-label={b.label}
			title={b.label}
			disabled={b.disabled}
			onclick={b.onclick}
		>
			<b.icon size={20} strokeWidth={1.75} />
		</button>
	{/each}
</div>

<div class="centre" style:pointer-events={events}>
	<button type="button" class="round skip" aria-label={labels.back} onclick={() => onseek(-10)}>
		<RotateCcw size={30} strokeWidth={1.5} /><span>10</span>
	</button>
	<button
		type="button"
		class="round big"
		aria-label={playing ? labels.pause : labels.play}
		onclick={ontoggle}
	>
		{#if playing}
			<Pause size={40} fill="currentColor" strokeWidth={0} />
		{:else}
			<Play size={40} fill="currentColor" strokeWidth={0} />
		{/if}
	</button>
	<button type="button" class="round skip" aria-label={labels.forward} onclick={() => onseek(10)}>
		<RotateCw size={30} strokeWidth={1.5} /><span>10</span>
	</button>
</div>

<PausedCard
	on={paused && live}
	eyebrow={pausedEyebrow}
	title={pausedTitle}
	text={pausedText}
	remaining={pausedLeft}
	bottom={120}
/>

<div class="bottom" style:pointer-events={events}>
	<div class="times"><span>{current}</span><span>-{remaining}</span></div>
	<Scrubber thin {...scrub} />
	<div class="row">
		{#if badge}
			<button
				type="button"
				class="stats"
				aria-label={labels.stats}
				title={labels.stats}
				onclick={onstats}
			>
				{#if badgeDot}
					<span class="dot" style:background={badgeDot}></span>
				{/if}
				{badge}
			</button>
			<span class="sep">·</span>
		{/if}
		<span class="chapter">{chapter}</span>
		<div class="grow"></div>
		{#if hasNext}
			<button type="button" class="next" onclick={onnext}>
				<SkipForward size={16} fill="currentColor" />{labels.next}
			</button>
		{/if}
	</div>
</div>

<style>
.top {
	position: absolute;
	top: 20px;
	display: flex;
	align-items: center;
}

.top.left {
	left: 28px;
	gap: 14px;
}

.top.right {
	right: 28px;
	gap: 2px;
}

.round {
	display: grid;
	place-items: center;
	border: 0;
	border-radius: 50%;
	color: var(--player-ink);
	cursor: pointer;
}

.back,
.tool {
	background: transparent;
}

.back {
	width: 40px;
	height: 40px;
}

.tool {
	width: 42px;
	height: 42px;
}

.back:hover,
.tool:hover:not(:disabled) {
	background: rgba(255, 255, 255, 0.12);
}

.tool.on {
	background: color-mix(in srgb, var(--player-accent) 22%, transparent);
}

.name {
	font-size: 14px;
	font-weight: 500;
	color: var(--player-ink-muted);
	white-space: nowrap;
}

.short {
	color: var(--fg-subtle);
}

.centre {
	position: absolute;
	left: 50%;
	top: 50%;
	transform: translate(-50%, -50%);
	display: flex;
	align-items: center;
	gap: 44px;
}

.skip,
.big {
	position: relative;
	-webkit-backdrop-filter: blur(8px);
	backdrop-filter: blur(8px);
}

.skip {
	width: 64px;
	height: 64px;
	background: rgba(0, 0, 0, 0.28);
}

.skip:hover {
	background: rgba(0, 0, 0, 0.45);
}

.skip > :global(svg),
.skip span {
	grid-area: 1 / 1;
}

.skip span {
	font: 700 9px / 1 var(--font-mono);
	font-variant-numeric: tabular-nums;
}

.big {
	width: 92px;
	height: 92px;
	background: rgba(0, 0, 0, 0.32);
	-webkit-backdrop-filter: blur(10px);
	backdrop-filter: blur(10px);
	box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.25);
}

.big:hover {
	background: rgba(0, 0, 0, 0.5);
}

.bottom {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	padding: 0 28px 6px;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.times {
	display: flex;
	justify-content: space-between;
	font: 500 12px var(--font-mono);
	color: var(--player-ink-muted);
}

.row {
	display: flex;
	align-items: center;
	gap: 6px;
	min-height: 44px;
	font: 500 12px var(--font-mono);
	color: var(--player-ink-muted);
}

.stats,
.next {
	height: 44px;
	display: flex;
	align-items: center;
	padding: 0 10px;
	border: 0;
	border-radius: 22px;
	background: transparent;
	white-space: nowrap;
	cursor: pointer;
}

.stats {
	gap: 7px;
	margin-left: -10px;
	color: var(--player-ink-muted);
	font: 500 12px var(--font-mono);
}

.stats:hover,
.next:hover {
	background: var(--player-control-hover);
}

.stats:hover {
	color: var(--player-ink);
}

.next {
	gap: 8px;
	margin-right: -14px;
	padding: 0 14px;
	color: var(--player-ink);
	font: 600 13px var(--font-sans);
}

.dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
}

.sep {
	color: var(--fg-faint);
}

.chapter {
	min-width: 0;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.grow {
	flex: 1;
}
</style>
