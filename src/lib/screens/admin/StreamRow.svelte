<script lang="ts">
import type { Act, Row } from "#lib/core/server-view.ts";
import { initialsOf } from "#lib/core/me.svelte.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import { TONES } from "#lib/screens/admin/tone.ts";
import Icon from "#lib/ui/Icon.svelte";
import { artwork } from "#platform";

let { row, onact }: { row: Extract<Row, { t: "stream" }>; onact?: (a: Act) => void } = $props();

const COLORS = [
	"var(--kind-album)",
	"var(--kind-episode)",
	"var(--kind-movie)",
	"var(--kind-book)",
];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
const initials = $derived(initialsOf(row.user.replace(/ \(.*\)$/, "")));
const color = $derived(COLORS[Math.abs(hash(row.user)) % COLORS.length]);
const tone = $derived(TONES[row.tone]);
const image = $derived(row.poster ? artwork(row.kind, row.poster.id, "backdrop") : undefined);
let failed = $state(false);
</script>

<div class="stream">
	<div class="thumb">
		{#if image && !failed}
			<img src={image} alt="" onerror={() => (failed = true)}>
		{/if}
		{#if !row.playing}
			<div class="paused"><Icon name="pause" size={22} filled /></div>
		{/if}
	</div>
	<div class="body">
		<div class="top">
			<span class="titles">
				<span class="title">{row.title}</span>
				<span class="sub">{row.sub}</span>
			</span>
			<span
				class="mode"
				style:color={tone.fg}
				style:background={tone.bg}
				style:border-color={tone.line}
				>{row.mode}</span
			>
		</div>
		<div class="who">
			<span class="av" style:background={color}>{initials}</span>
			<span>{row.user}</span><span class="sep">·</span><span>{row.device}</span
			><span class="sep">·</span>
			<span class="where">{row.where}</span>
		</div>
		<span class="path">{row.path}</span>
		<div class="bar">
			<div class="track"><div style:width="{row.pct}%"></div></div>
			<span class="time">{row.time}</span>
			<span class="mbps">{row.mbps}</span>
			<button
				type="button"
				class="stop"
				aria-label={i18n.server_stop_label({ name: row.short })}
				onclick={() => onact?.({ do: "stop", id: row.id })}
			>
				{i18n.server_stop()}
			</button>
		</div>
	</div>
</div>

<style>
.stream {
	display: flex;
	align-items: flex-start;
	gap: 14px;
	flex-wrap: wrap;
}

.thumb {
	position: relative;
	flex: none;
	width: 128px;
	aspect-ratio: 16 / 9;
	border-radius: 8px;
	overflow: hidden;
	background: var(--bg-player);
}

.thumb img {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.paused {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	background: rgba(0, 0, 0, 0.45);
	color: var(--fg);
}

.body {
	flex: 1 1 220px;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 7px;
}

.top {
	display: flex;
	align-items: flex-start;
	gap: 10px;
}

.titles {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 1px;
}

.title {
	font-size: 14px;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.sub {
	font-size: 12.5px;
	color: var(--fg-subtle);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.mode {
	flex: none;
	height: 22px;
	display: inline-flex;
	align-items: center;
	padding: 0 8px;
	border-radius: var(--radius-sm);
	border: 1px solid;
	font: 500 10.5px var(--font-mono);
}

.who {
	display: flex;
	align-items: center;
	gap: 7px;
	flex-wrap: wrap;
	font-size: 12.5px;
	color: var(--fg-muted);
}

.av {
	width: 20px;
	height: 20px;
	border-radius: var(--radius-sm);
	display: grid;
	place-items: center;
	color: var(--bg-deep);
	font-size: 9px;
	font-weight: 600;
}

.sep {
	color: var(--fg-faint);
}

.where {
	color: var(--fg-subtle);
}

.path {
	font: 400 11.5px var(--font-mono);
	line-height: 1.5;
	color: var(--fg-subtle);
	overflow-wrap: anywhere;
}

.bar {
	display: flex;
	align-items: center;
	gap: 12px;
}

.track {
	flex: 1;
	height: 4px;
	border-radius: var(--radius-full);
	background: rgba(255, 255, 255, 0.1);
	overflow: hidden;
}

.track div {
	height: 100%;
	border-radius: var(--radius-full);
	background: var(--accent);
	transition: width 900ms linear;
}

.time {
	flex: none;
	font: 400 11.5px var(--font-mono);
	font-variant-numeric: tabular-nums;
	color: var(--fg-muted);
}

.mbps {
	flex: none;
	font: 400 11.5px var(--font-mono);
	color: var(--fg-subtle);
}

.stop {
	flex: none;
	height: 32px;
	padding: 0 11px;
	border-radius: 8px;
	border: 1px solid color-mix(in srgb, var(--status-failed) 40%, transparent);
	background: transparent;
	color: var(--status-failed);
	font: inherit;
	font-size: 12.5px;
	font-weight: 500;
	cursor: pointer;
}

.stop:hover {
	background: color-mix(in srgb, var(--status-failed) 10%, transparent);
}
</style>
