<script lang="ts">
import Icon from "#lib/ui/Icon.svelte";
import { cardSrcset } from "#lib/ui/img.ts";

let {
	src,
	small,
	ratio,
	kind = "backdrop",
	position,
	fallback,
}: {
	src?: string;
	/** A card-sized `src`, see `cardSrcset`. */
	small?: string;
	ratio?: string;
	kind?: "poster" | "backdrop";
	position?: string;
	/** Shown blurred when `src` cannot load: a title with no backdrop still gets its poster's colours. */
	fallback?: string;
} = $props();

let failed = $state(false);
// Offline, a downloaded title has only its full poster.
let smallFailed = $state(false);
let softReady = $state(false);
let loaded = $state(false);
let img = $state<HTMLImageElement>();

$effect(() => {
	src;
	failed = false;
	smallFailed = false;
	loaded = false;
	softReady = false;
});
// A cached image can finish before the handlers are attached. `complete` alone is no verdict:
// WebKit also says it of an image it has not decoded or has put off loading, with no size yet,
// so a refusal here is left to the handlers.
$effect(() => {
	const shown = src;
	if (img?.complete)
		img.decode().then(
			() => {
				if (src === shown) loaded = true;
			},
			() => {},
		);
});
</script>

<span class="art" class:sized={!!ratio} style:aspect-ratio={ratio}>
	{#if kind === "poster"}
		<span class="ph"><Icon name="film" /></span>
	{:else}
		<span class="frame" aria-hidden="true"></span>
	{/if}
	{#if src && !failed}
		<img
			bind:this={img}
			{src}
			srcset={smallFailed ? undefined : cardSrcset(small, src)}
			alt=""
			draggable="false"
			loading="lazy"
			decoding="async"
			class:loaded
			style:object-position={position}
			onload={() => (loaded = true)}
			onerror={() => {
				if (small && !smallFailed) smallFailed = true;
				else failed = true;
			}}
		>
	{:else if fallback && failed}
		<img
			src={fallback}
			alt=""
			draggable="false"
			class="soft"
			class:loaded={softReady}
			onload={() => (softReady = true)}
		>
	{/if}
</span>

<style>
.art {
	position: absolute;
	inset: 0;
	display: block;
	overflow: hidden;
}

.art.sized {
	position: relative;
	inset: auto;
	width: 100%;
}

.frame {
	position: absolute;
	inset: 0;
	overflow: hidden;
	background: var(--bg-stage);
}

.frame::before {
	content: "";
	position: absolute;
	inset: 18% -10% 30% 40%;
	border-radius: 50%;
	background: color-mix(in srgb, var(--accent) 24%, var(--bg-stage));
	filter: blur(60px);
}

.frame::after {
	content: "";
	position: absolute;
	inset: 55% 30% -20% -10%;
	border-radius: 50%;
	background: color-mix(in srgb, var(--status-wanted) 16%, var(--bg-stage));
	filter: blur(70px);
}

.ph {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	font-size: 40px;
	color: var(--fg-faint);
}

img {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
	opacity: 0;
	/* Android WebView turns a held image into its own drag or save menu and cancels the pointer. */
	pointer-events: none;
	-webkit-touch-callout: none;
}

img.loaded {
	opacity: 1;
}

img.soft {
	filter: blur(36px) saturate(1.3);
	transform: scale(1.25);
}
</style>
