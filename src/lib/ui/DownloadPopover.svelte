<script lang="ts">
import Button from "#lib/ui/Button.svelte";
import "#lib/ui/ui.css";

type State = "downloading" | "waiting" | "failed" | "done";

let {
	state,
	title,
	eyebrow,
	progress,
	got,
	rate,
	size,
	quality,
	cause,
	kept,
	group,
	words,
	onopen,
	oncancel,
	onremove,
	onretry,
}: {
	state: State;
	title: string;
	eyebrow: string;
	progress: number;
	got: string;
	rate: string;
	size: string;
	quality: string;
	cause: string | null;
	kept: string | null;
	group: boolean;
	words: {
		open: string;
		size: string;
		quality: string;
		removeDownload: string;
		removeAll: string;
		retry: string;
		remove: string;
		cancel: string;
		cancelRemaining: string;
	};
	onopen: () => void;
	oncancel: () => void;
	onremove: () => void;
	onretry: () => void;
} = $props();

const COLOR: Record<State, string> = {
	downloading: "var(--accent-text)",
	waiting: "var(--fg-subtle)",
	failed: "var(--status-failed)",
	done: "var(--status-available)",
};
</script>

<div class="sl-dlpop" role="dialog" aria-label="{eyebrow}: {title}">
	<span class="open">
		<Button
			variant="icon"
			icon="arrow-right"
			label={words.open}
			title={words.open}
			onclick={onopen}
		/>
	</span>
	<div class="head">
		<span class="sl-sec eyebrow" style:color={COLOR[state]}>{eyebrow}</span>
		<span class="title">{title}</span>
	</div>
	{#if state === "done"}
		<div class="sl-dlpop__grid">
			<span><span>{words.size}</span>{size}</span>
			<span><span>{words.quality}</span>{quality}</span>
		</div>
		<Button variant="destructive" size="sm" icon="trash-2" onclick={onremove}>
			{group ? words.removeAll : words.removeDownload}
		</Button>
	{:else if state === "failed"}
		<div class="sl-dlpop__bar">
			<b style:width="{progress}%" style:background="var(--status-failed)"></b>
		</div>
		<div class="meta stack">
			<span class="why">{cause}</span>
			{#if kept}
				<span>{kept}</span>
			{/if}
		</div>
		<div class="actions">
			<Button variant="secondary" size="sm" icon="rotate-cw" onclick={onretry}
				>{words.retry}</Button
			>
			<Button variant="destructive" size="sm" onclick={onremove}>{words.remove}</Button>
		</div>
	{:else}
		<div class="sl-dlpop__bar">
			<b
				style:width="{progress}%"
				style:background={state === "waiting" ? "var(--fg-subtle)" : undefined}
			></b>
		</div>
		<div class="meta">
			<span class="got">{got}</span>
			<span class:rate={state !== "waiting"}>{rate}</span>
		</div>
		<div class="actions">
			<Button variant="destructive" size="sm" onclick={oncancel}>
				{group ? words.cancelRemaining : words.cancel}
			</Button>
		</div>
	{/if}
</div>

<style>
.sl-dlpop {
	position: relative;
	width: 320px;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 16px;
	border: 1px solid var(--border);
	border-radius: 14px;
	background: var(--bg-elevated);
	box-shadow: var(--shadow-4);
}

.sl-dlpop__bar {
	height: 6px;
	overflow: hidden;
	border-radius: var(--radius-full);
	background: color-mix(in srgb, var(--fg) 10%, transparent);
}

.sl-dlpop__bar > b {
	display: block;
	height: 100%;
	border-radius: inherit;
	background: var(--player-accent);
}

.sl-dlpop__grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 12px;
	font: 400 12px var(--font-mono);
	color: var(--fg-muted);
}

.open {
	position: absolute;
	right: 8px;
	top: 8px;
}

.open :global(.sl-btn--icon) {
	width: 32px;
	height: 32px;
}

.open :global(.sl-ico) {
	font-size: 16px;
}

.head {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-right: 32px;
}

.eyebrow {
	margin: 0;
	padding: 0;
}

.title {
	font-size: 14.5px;
	font-weight: 600;
}

.meta {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	font: 400 11.5px var(--font-mono);
	color: var(--fg-subtle);
}

.meta > span {
	white-space: nowrap;
}

.got {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
}

.rate {
	color: var(--accent-text);
}

.stack {
	flex-direction: column;
	gap: 2px;
}

.stack > span {
	white-space: normal;
}

.sl-dlpop__grid span span {
	display: block;
	margin-bottom: 3px;
	font-size: 10.5px;
	letter-spacing: 0.1em;
	text-transform: uppercase;
	color: var(--fg-faint);
}

.why {
	color: var(--status-failed);
}

.actions {
	display: flex;
	gap: 8px;
}

.actions :global(.sl-btn) {
	flex: 1;
}
</style>
