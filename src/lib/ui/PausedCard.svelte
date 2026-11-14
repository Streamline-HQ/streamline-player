<script lang="ts">
let {
	on,
	eyebrow,
	title,
	text,
	remaining,
}: { on: boolean; eyebrow: string; title: string; text: string; remaining: string } = $props();

// What the card last said while it showed: the remaining time ticks on as playback resumes, and
// rewriting the text every frame makes the way out stutter.
let held = $state({ eyebrow: "", title: "", text: "", remaining: "" });
$effect(() => {
	if (on) held = { eyebrow, title, text, remaining };
});
</script>

<div class="card paused" class:on aria-hidden={!on}>
	<span class="eyebrow">{held.eyebrow}</span>
	<span class="title">{held.title}</span>
	<span class="text">{held.text}</span>
	<span class="left">{held.remaining}</span>
</div>

<style>
.card {
	position: absolute;
	left: 28px;
	bottom: 128px;
	width: min(460px, 46%);
	display: flex;
	flex-direction: column;
	gap: 8px;
	opacity: 0;
	transform: translateY(10px);
	visibility: hidden;
	pointer-events: none;
	will-change: opacity, transform;
	transition:
		opacity 180ms var(--ease-in),
		transform 180ms var(--ease-in),
		visibility 0s 180ms;
}

.card.on {
	opacity: 1;
	transform: none;
	visibility: visible;
	transition:
		opacity 300ms var(--ease),
		transform 300ms var(--ease);
}

.eyebrow {
	font: 500 11px var(--font-mono);
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--player-accent-text);
}

.title {
	font-size: 30px;
	line-height: 1.1;
	font-weight: 700;
	letter-spacing: -0.02em;
}

.text {
	font-size: 14px;
	line-height: 1.55;
	color: var(--player-ink-muted);
}

.left {
	font: 400 12px var(--font-mono);
	color: var(--fg-subtle);
}
</style>
