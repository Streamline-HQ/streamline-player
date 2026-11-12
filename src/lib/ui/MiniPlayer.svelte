<script lang="ts">
import Art from "#lib/ui/Art.svelte";
import { Maximize, Pause, Play, X } from "@lucide/svelte";

let {
	title,
	still,
	progress,
	playing,
	width = 340,
	live = false,
	ready = true,
	labels,
	art = $bindable(),
	ontoggle,
	onexpand,
	onclose,
}: {
	title: string;
	still?: string;
	progress: number;
	playing: boolean;
	width?: number;
	live?: boolean;
	ready?: boolean;
	labels: { play: string; pause: string; expand: string; close: string };
	art?: HTMLElement;
	ontoggle: () => void;
	onexpand: () => void;
	onclose: () => void;
} = $props();

const hole = $derived(live && ready);
</script>

<div class="mini" class:hole style:width="{width}px">
	<div class="art" bind:this={art}>
		{#if !hole}
			<Art src={still} />
		{/if}
		<div class="shade"></div>
		<div class="title">{title}</div>
		<button type="button" class="x" aria-label={labels.close} onclick={onclose}>
			<X size={16} />
		</button>
		<div class="ctl">
			<button
				type="button"
				class="btn ink"
				aria-label={playing ? labels.pause : labels.play}
				onclick={ontoggle}
			>
				{#if playing}
					<Pause size={18} fill="currentColor" strokeWidth={0} />
				{:else}
					<Play size={18} fill="currentColor" strokeWidth={0} />
				{/if}
			</button>
			<button type="button" class="btn" aria-label={labels.expand} onclick={onexpand}>
				<Maximize size={18} />
			</button>
		</div>
		<div class="bar"><b style:width="{progress}%"></b></div>
	</div>
</div>

<style>
.mini {
	position: relative;
	overflow: hidden;
	border-radius: var(--radius-player-controls);
	background: var(--bg-player);
	color: var(--player-ink);
	box-shadow:
		var(--shadow-4),
		0 0 0 1px var(--border-strong);
	animation: sl-rise var(--dur-slow) var(--ease);
}

.mini.hole {
	background: transparent;
}

.art {
	position: relative;
	aspect-ratio: var(--card-aspect-backdrop);
}

.shade {
	position: absolute;
	inset: 0;
	background: linear-gradient(
		180deg,
		rgba(0, 0, 0, 0.55) 0%,
		transparent 40%,
		transparent 60%,
		rgba(0, 0, 0, 0.7) 100%
	);
}

.title {
	position: absolute;
	left: 12px;
	top: 10px;
	right: 44px;
	font-size: 12px;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.x {
	position: absolute;
	right: 6px;
	top: 6px;
	width: 30px;
	height: 30px;
	display: grid;
	place-items: center;
	border: 0;
	border-radius: 8px;
	background: var(--player-glass);
	color: var(--player-ink);
	cursor: pointer;
}

/* The page overrides the system's bottom row: the controls sit in the middle of the picture. */
.ctl {
	position: absolute;
	left: 0;
	right: 0;
	top: 50%;
	transform: translateY(-50%);
	display: flex;
	justify-content: center;
	gap: 10px;
}

.btn {
	width: 40px;
	height: 40px;
	display: grid;
	place-items: center;
	border: 0;
	border-radius: 50%;
	background: var(--player-glass);
	color: var(--player-ink);
	cursor: pointer;
}

.x:hover,
.btn:hover {
	background: var(--player-glass-strong);
}

.btn.ink,
.btn.ink:hover {
	background: var(--player-ink);
	color: var(--bg-deep);
}

.bar {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 3px;
	background: var(--player-track);
}

.bar b {
	display: block;
	height: 100%;
	background: var(--player-accent);
}

@media (prefers-reduced-motion: reduce) {
	.mini {
		animation: none;
	}
}
</style>
