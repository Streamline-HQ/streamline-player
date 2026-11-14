<script lang="ts">
import Tip from "#lib/ui/Tip.svelte";
import DownloadButton from "#lib/ui/DownloadButton.svelte";
import Icon from "#lib/ui/Icon.svelte";
import type { ComponentProps } from "svelte";

let {
	title,
	poster,
	watched,
	progress,
	year,
	res,
	hdr,
	hdrOn,
	audio,
	size,
	added,
	playLabel,
	mark,
	lang,
	download,
	onplay,
	onclick,
}: {
	title: string;
	poster?: string;
	watched: boolean;
	progress: number;
	year: string;
	res: string;
	hdr: string;
	hdrOn: boolean;
	audio: string;
	size: string;
	added: string;
	playLabel?: string;
	mark?: { on: boolean; label: string; onclick: () => void };
	lang?: { own: boolean; label: string; onclick: (trigger: HTMLElement) => void };
	download?: Pick<ComponentProps<typeof DownloadButton>, "look" | "label" | "onclick">;
	onplay?: () => void;
	onclick: () => void;
} = $props();

let broken = $state(false);
</script>

<div class="row">
	<button type="button" class="hit" aria-label={title} {onclick}></button>
	<span class="thumb">
		{#if poster && !broken}
			<img src={poster} alt="" loading="lazy" onerror={() => (broken = true)}>
		{/if}
	</span>
	<span class="main">
		<span class="line">
			<span class="title">{title}</span>
			{#if watched}
				<span class="seen"><Icon name="tick" size={13} stroke={2.5} /></span>
			{/if}
		</span>
		{#if progress > 0 && !watched}
			<span class="bar"><span style:width="{progress}%"></span></span>
		{/if}
	</span>
	<span class="cell muted">{year}</span>
	<span class="cell">{res}</span>
	<span class="cell" class:faint={!hdrOn}>{hdr}</span>
	<span class="cell muted clip">{audio}</span>
	<span class="cell muted end">{size}</span>
	<span class="cell subtle end">{added}</span>
	<span class="tools">
		{#if onplay}
			<button type="button" class="tool" aria-label={playLabel} title={playLabel} onclick={onplay}>
				<Icon name="play" filled size={15} />
			</button>
		{/if}
		{#if mark}
			<button
				type="button"
				class="tool"
				class:on={mark.on}
				aria-label={mark.label}
				onclick={mark.onclick}
			>
				<Tip text={mark.label} />
				<Icon name={mark.on ? "check-check" : "eye"} size={16} stroke={1.75} />
			</button>
		{/if}
		{#if lang}
			<button
				type="button"
				class="tool"
				class:own={lang.own}
				data-lang-trigger="lib"
				aria-label={lang.label}
				onclick={(e) => lang.onclick(e.currentTarget)}
			>
				<Tip text={lang.label} />
				<Icon name="languages" size={16} stroke={1.8} />
			</button>
		{/if}
		{#if download}
			<DownloadButton
				variant="poster"
				look={download.look}
				label={download.label}
				onclick={download.onclick}
			/>
		{/if}
	</span>
</div>

<style>
.row {
	position: relative;
	display: grid;
	grid-template-columns: var(--cols);
	gap: 16px;
	align-items: center;
	min-height: 62px;
	padding: 8px 12px;
	border: 0;
	border-bottom: 1px solid var(--border);
	border-radius: 0;
	background: transparent;
	color: var(--fg);
	text-align: left;
}

.row:hover {
	background: var(--surface);
}

/* The whole row opens the title; the tools sit above it and keep their own clicks. */
.hit {
	position: absolute;
	inset: 0;
	padding: 0;
	border: 0;
	background: transparent;
	cursor: pointer;
}

.hit:focus-visible {
	outline: 2px solid var(--accent-ring);
	outline-offset: -2px;
}

.row > span {
	pointer-events: none;
}

.tools {
	position: relative;
	display: flex;
	justify-content: flex-end;
	align-items: center;
	gap: 2px;
	opacity: 0;
	transition: opacity 120ms var(--ease);
}

.row:hover .tools,
.row:focus-within .tools {
	opacity: 1;
}

.tools > :global(*) {
	pointer-events: auto;
}

.tool {
	flex: none;
	width: 34px;
	height: 34px;
	display: grid;
	place-items: center;
	padding: 0;
	border: 0;
	border-radius: 50%;
	background: transparent;
	color: var(--fg-subtle);
	cursor: pointer;
}

.tool:hover {
	background: var(--surface-2);
	color: var(--fg);
}

.tool.on {
	color: var(--status-available);
}

.tool.own {
	color: var(--accent);
}

.thumb {
	display: block;
	width: 32px;
	aspect-ratio: 2 / 3;
	border-radius: 4px;
	overflow: hidden;
	background: var(--bg-card);
}

img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}

.main {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.line {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.title {
	font-size: 14px;
	font-weight: 500;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.seen {
	flex: none;
	display: grid;
	color: var(--status-available);
}

.bar {
	width: 120px;
	height: 3px;
	border-radius: 2px;
	background: rgba(255, 255, 255, 0.12);
	overflow: hidden;
}

.bar > span {
	display: block;
	height: 100%;
	background: var(--accent);
}

.cell {
	font: 400 12px var(--font-mono);
	color: var(--fg);
	white-space: nowrap;
}

.muted {
	color: var(--fg-muted);
}

.subtle {
	color: var(--fg-subtle);
}

.faint {
	color: var(--fg-faint);
}

.clip {
	overflow: hidden;
	text-overflow: ellipsis;
}

.end {
	text-align: right;
}
</style>
