<script lang="ts">
import { clock, hoverAt, type Segment } from "#lib/core/player-view.ts";
import { type Trickplay, tileAt } from "#lib/core/trickplay.ts";
import { hideBroken } from "#lib/ui/img.ts";

type Chapter = { start: number; end: number; title: string };

let {
	segs,
	chapters,
	position,
	buffered,
	duration,
	still,
	trickplay = null,
	label,
	thin = false,
	onseek,
	onhovering,
	onactivity,
}: {
	segs: Segment[];
	chapters: Chapter[];
	position: number;
	buffered: number;
	duration: number;
	still: string;
	trickplay?: Trickplay | null;
	label: string;
	/** The touch layout: a flat chaptered track with no handle, a smaller hit area. */
	thin?: boolean;
	onseek: (seconds: number) => void;
	onhovering: (on: boolean) => void;
	onactivity: () => void;
} = $props();

let hover = $state<number | null>(null);
let drag = $state<number | null>(null);
let failed = $state<string[]>([]);
let frameWidth = $state(0);
let frameHeight = $state(0);

const shown = $derived(drag !== null ? drag * duration : position);
const pct = $derived(duration > 0 ? Math.min(100, (shown / duration) * 100) : 0);
const peek = $derived(hover === null ? null : hoverAt(hover, duration, chapters));
const tile = $derived.by(() => {
	if (!trickplay || !peek) return null;
	const t = tileAt(trickplay, peek.time);
	return failed.includes(t.sheet) ? null : t;
});
const scale = $derived(
	trickplay && frameWidth && frameHeight
		? Math.max(frameWidth / trickplay.tileWidth, frameHeight / trickplay.tileHeight)
		: 0,
);
const inset = $derived({
	x: trickplay ? (frameWidth - trickplay.tileWidth * scale) / 2 : 0,
	y: trickplay ? (frameHeight - trickplay.tileHeight * scale) / 2 : 0,
});
const grown = $derived(hover !== null || drag !== null);

const within = (at: number, s: Segment) =>
	s.to > s.from && duration > 0
		? Math.max(0, Math.min(100, ((at / duration - s.from) / (s.to - s.from)) * 100))
		: 0;

function ratio(e: PointerEvent) {
	const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
	return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
}

$effect(() => {
	const sheet = tile?.sheet;
	if (!sheet) return;
	const img = new Image();
	img.onerror = () => (failed = [...failed, sheet]);
	img.src = sheet;
});

function setHover(v: number | null) {
	hover = v;
	onhovering(v !== null);
}
</script>

<div
	class="scrub"
	class:thin
	role="slider"
	tabindex="-1"
	aria-label={label}
	aria-valuemin="0"
	aria-valuemax={Math.round(duration)}
	aria-valuenow={Math.round(shown)}
	onpointerdown={(e) => {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		drag = ratio(e);
	}}
	onpointermove={(e) => {
		const r = ratio(e);
		if (drag !== null) {
			drag = r;
			setHover(r);
		} else if (e.pointerType === "mouse") setHover(r);
		onactivity();
	}}
	onpointerup={(e) => {
		if (drag !== null) {
			const r = ratio(e);
			drag = null;
			onseek(r * duration);
		}
		if (e.pointerType !== "mouse") setHover(null);
	}}
	onpointerleave={() => {
		if (drag === null) setHover(null);
	}}
>
	<div class="track" style:height="{thin ? (grown ? 6 : 3) : grown ? 7 : 4}px">
		{#each segs as s}
			<div class="seg" style:flex={s.to - s.from}>
				<div class="buf" style:width="{within(buffered, s)}%"></div>
				<div class="fill" style:transform="scaleX({within(shown, s) / 100})"></div>
			</div>
		{/each}
	</div>
	{#if !thin}
		<div class="thumb" style:transform="translateX({pct}cqw)"></div>
	{/if}
	{#if peek && hover !== null}
		<div class="peek" style:left="{Math.max(7, Math.min(93, hover * 100))}%">
			<div class="frame" bind:clientWidth={frameWidth} bind:clientHeight={frameHeight}>
				{#if tile && trickplay}
					<div
						class="tile"
						style:background-image="url({tile.sheet})"
						style:background-size="{trickplay.cols * trickplay.tileWidth * scale}px auto"
						style:background-position="{inset.x - tile.x * scale}px {inset.y - tile.y * scale}px"
					></div>
				{:else}
					<img
						src={still}
						alt=""
						style:object-position="{Math.round(hover * 100)}% 50%"
						onerror={hideBroken}
					>
				{/if}
			</div>
			<div class="when">{clock(peek.time, duration)}{peek.chapter ? ` · ${peek.chapter}` : ""}</div>
		</div>
	{/if}
</div>

<style>
.scrub {
	position: relative;
	height: 24px;
	display: flex;
	align-items: center;
	cursor: pointer;
	touch-action: none;
	container-type: inline-size;
}

.track {
	position: relative;
	flex: 1;
	display: flex;
	gap: 3px;
	transition: height 120ms;
}

.seg {
	position: relative;
	height: 100%;
	border-radius: 3px;
	background: var(--player-track);
	overflow: hidden;
}

.buf,
.fill {
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
}

.buf {
	background: var(--player-buffer);
}

/* The position moves on every display frame: a transform skips the layout a width would cost. */
.fill {
	width: 100%;
	transform-origin: left;
	background: var(--player-accent);
}

.thumb {
	position: absolute;
	left: 0;
	top: 50%;
	width: 14px;
	height: 14px;
	margin: -7px 0 0 -7px;
	border-radius: 50%;
	background: var(--player-ink);
	box-shadow: 0 0 0 4px var(--player-thumb-ring);
}

.peek {
	position: absolute;
	bottom: 30px;
	transform: translateX(-50%);
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	pointer-events: none;
}

.frame {
	width: 184px;
	aspect-ratio: 16 / 9;
	border-radius: 8px;
	overflow: hidden;
	box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
	border: 2px solid color-mix(in srgb, var(--player-ink) 90%, transparent);
}

.tile {
	width: 100%;
	height: 100%;
	background-repeat: no-repeat;
}

.frame img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}

.when {
	font: 500 12px var(--font-mono);
	padding: 3px 8px;
	border-radius: var(--radius-sm);
	background: var(--player-scrim);
	white-space: nowrap;
}

.thin {
	height: 18px;
}

.thin .track {
	gap: 2px;
}

.thin .seg {
	border-radius: 0;
}

.thin .peek {
	bottom: 24px;
}

.thin .frame {
	width: 176px;
}
</style>
