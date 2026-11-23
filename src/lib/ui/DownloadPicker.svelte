<script lang="ts">
import type { PickRow } from "#lib/core/downloads-view.ts";
import Button from "#lib/ui/Button.svelte";
import ChoicePills from "#lib/ui/ChoicePills.svelte";
import Dialog from "#lib/ui/Dialog.svelte";
import Icon from "#lib/ui/Icon.svelte";
import "#lib/ui/ui.css";

const MAX_HEIGHT = 420;

let {
	title,
	note,
	audio,
	subs,
	total,
	canDownload,
	quality,
	qualities,
	remember,
	shown,
	words,
	onquality,
	onaudio,
	onsub,
	onremember,
	oncancel,
	onconfirm,
}: {
	title: string;
	note: string;
	audio: PickRow[];
	subs: PickRow[];
	total: string;
	canDownload: boolean;
	quality: string;
	qualities: [string, string][];
	remember: boolean;
	shown: boolean;
	words: {
		quality: string;
		qualityGroup: string;
		audio: string;
		subtitles: string;
		remember: string;
		cancel: string;
		download: string;
		close: string;
	};
	onquality: (q: string) => void;
	onaudio: (index: number) => void;
	onsub: (index: number) => void;
	onremember: () => void;
	oncancel: () => void;
	onconfirm: () => void;
} = $props();
// The label draws the hidden input's keyboard ring; Chromium 87 has no :has().
let ring = $state<string | null>(null);
const ringOn = (key: string) => (e: FocusEvent) => {
	ring = (e.currentTarget as HTMLElement).matches(":focus-visible") ? key : null;
};
const ringOff = () => {
	ring = null;
};
</script>

{#snippet box(on: boolean)}
	<span class="box" class:on aria-hidden="true">
		<Icon name="tick" size={12} stroke={3} />
	</span>
{/snippet}

<Dialog {title} closeLabel={words.close} {shown} onclose={oncancel}>
	<div class="body" style:max-height="{MAX_HEIGHT}px">
		<div class="section">
			<span class="eyebrow">{words.quality}</span>
			<ChoicePills
				options={qualities}
				value={quality}
				label={words.qualityGroup}
				onchange={onquality}
			/>
			<span class="note">{note}</span>
		</div>
		<div class="list">
			<span class="eyebrow">{words.audio}</span>
			{#each audio as a (a.index)}
				<label class={["row", ring === `a${a.index}` && "ring"]}>
					<input
						type="checkbox"
						checked={a.on}
						onchange={() => onaudio(a.index)}
						onfocus={ringOn(`a${a.index}`)}
						onblur={ringOff}
					>
					{@render box(a.on)}
					<span class="text">
						<span class="name">{a.label}</span>
						<span class="sub">{a.sub}</span>
					</span>
					<span class="size">{a.size}</span>
				</label>
			{/each}
		</div>
		{#if subs.length}
			<div class="list">
				<span class="eyebrow">{words.subtitles}</span>
				<div class="subs">
					{#each subs as s (s.index)}
						<label class={["row", s.disabled && "off", ring === `s${s.index}` && "ring"]}>
							<input
								type="checkbox"
								onfocus={ringOn(`s${s.index}`)}
								onblur={ringOff}
								checked={s.on}
								disabled={s.disabled}
								onchange={() => onsub(s.index)}
							>
							{@render box(s.on)}
							<span class="text">
								<span class="name">{s.label}</span>
								<span class="sub">{s.sub}</span>
							</span>
						</label>
					{/each}
				</div>
			</div>
		{/if}
		<div class="remember">
			<label class={["row", "muted", ring === "remember" && "ring"]}>
				<input
					type="checkbox"
					checked={remember}
					onchange={onremember}
					onfocus={ringOn("remember")}
					onblur={ringOff}
				>
				{@render box(remember)}
				<span>{words.remember}</span>
			</label>
		</div>
	</div>
	{#snippet footer()}
		<span class="total">{total}</span>
		<Button variant="secondary" onclick={oncancel}>{words.cancel}</Button>
		<Button variant="primary" disabled={!canDownload} onclick={onconfirm}>{words.download}</Button>
	{/snippet}
</Dialog>

<style>
.body {
	display: flex;
	flex-direction: column;
	gap: 18px;
	overflow-y: auto;
	margin: 0 -6px;
	padding: 0 6px;
}

.section,
.list {
	display: flex;
	flex-direction: column;
}

.section {
	gap: 8px;
}

.eyebrow {
	margin-bottom: 4px;
	font: 500 10.5px var(--font-mono);
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--fg-faint);
}

.section .eyebrow {
	margin-bottom: 0;
}

.note {
	font-size: 12.5px;
	line-height: 1.45;
	color: var(--fg-subtle);
	text-wrap: pretty;
}

.subs {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
	column-gap: 16px;
}

.row {
	position: relative;
	width: calc(100% + 12px);
	margin: 0 -6px;
	display: flex;
	align-items: center;
	gap: 12px;
	min-height: 40px;
	padding: 4px 6px;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: var(--fg);
	font: inherit;
	text-align: left;
	cursor: pointer;
	transition: background var(--dur-fast);
}

.row input {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	margin: 0;
	opacity: 0;
	cursor: inherit;
}

.row:hover:not(.off) {
	background: var(--surface);
}

.row.off {
	cursor: default;
	opacity: 0.5;
}

.row.ring {
	outline: 2px solid var(--accent-ring);
	outline-offset: -2px;
}

.row.muted {
	color: var(--fg-muted);
	font-size: 13px;
	line-height: 1.4;
}

.box {
	flex: none;
	width: 18px;
	height: 18px;
	display: grid;
	place-items: center;
	border-radius: 5px;
	border: 1.5px solid rgb(var(--fg-rgb) / 28%);
	background: transparent;
	color: var(--fg-on-accent);
	transition:
		background 150ms var(--ease),
		border-color 150ms var(--ease);
}

.box :global(.sl-ico) {
	opacity: 0;
	transform: scale(0.6);
	transition:
		opacity 150ms var(--ease),
		transform 200ms var(--ease);
}

.box.on {
	border-color: var(--accent);
	background: var(--accent);
}

.box.on :global(.sl-ico) {
	opacity: 1;
	transform: scale(1);
}

.text {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 1px;
}

.name {
	font-size: 14px;
	color: var(--fg);
}

.sub {
	font: 400 11.5px var(--font-mono);
	color: var(--fg-subtle);
}

.size {
	flex: none;
	font: 400 12px var(--font-mono);
	font-variant-numeric: tabular-nums;
	color: var(--fg-muted);
}

.remember {
	padding-top: 10px;
	border-top: 1px solid var(--border);
}

.total {
	margin-right: auto;
	align-self: center;
	font: 400 12px var(--font-mono);
	font-variant-numeric: tabular-nums;
	color: var(--fg-subtle);
}
</style>
