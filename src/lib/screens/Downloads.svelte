<script lang="ts">
import { ask } from "#lib/core/ask.svelte.ts";
import { removeKeys } from "#lib/core/download-ask.svelte.ts";
import { dl, retry } from "#lib/core/downloads.svelte.ts";
import { type Card, type Group, pageView, storageView } from "#lib/core/downloads-view.ts";
import { localUrl } from "#lib/core/download-launch.ts";
import { stillPos } from "#lib/core/format.ts";
import { net } from "#lib/core/online.svelte.ts";
import { toast } from "#lib/core/toast.svelte.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import { downloadsPort } from "#lib/screens/downloads-port.ts";
import Banner from "#lib/ui/Banner.svelte";
import Button from "#lib/ui/Button.svelte";
import { downloadWords } from "#lib/ui/download-words.ts";
import EmptyState from "#lib/ui/EmptyState.svelte";
import Icon from "#lib/ui/Icon.svelte";
import { goto } from "#lib/ui/nav.ts";
import Art from "#lib/ui/Art.svelte";
import StorageMeter from "#lib/ui/StorageMeter.svelte";
import { artworkAt } from "#platform";

const PAD_X = 56;
const TOP = 92;
const BOTTOM = 32;

const words = $derived(downloadWords());
const view = $derived(pageView(dl.items, dl.rate, words));
const meter = $derived(dl.storage ? storageView(dl.storage, words) : null);
const byKey = (key: string) => dl.items.find((e) => e.key === key);

const stillOf = (key: string) => artworkAt(byKey(key)?.meta.still ?? "");
const posOf = (key: string) => {
	const m = byKey(key)?.meta;
	return m?.season != null && m.episode != null ? stillPos(m.episode, m.season) : "50% 40%";
};

function cancel(key: string) {
	removeKeys(downloadsPort, [key]);
	toast(i18n.dl_toast_cancelled());
}

function removeOne(key: string) {
	removeKeys(downloadsPort, [key]);
	toast(i18n.dl_toast_removed());
}

function removeAll(g: Group) {
	ask({
		title: i18n.dl_ask_title({ title: g.title }),
		body: i18n.dl_ask_body({
			episodes: words.episodes(g.keys.length),
			size: g.sub.split(" · ")[1] ?? "",
		}),
		confirm: i18n.dl_remove_all(),
		onconfirm: () => {
			removeKeys(downloadsPort, g.keys);
			toast(i18n.dl_toast_removed_title({ title: g.title }));
		},
	});
}

// Play on this screen always plays the file on disk, with no library or server call.
function play(c: Card) {
	const m = byKey(c.key)?.meta;
	if (m) goto(localUrl(m));
}

function open(c: Card) {
	const m = byKey(c.key)?.meta;
	if (!m) return;
	return goto(`/detail/${m.kind}/${m.title_id}${m.season != null ? `?s=${m.season}` : ""}`);
}

const openGroup = (g: Group) =>
	goto(`/detail/${g.titleKind}/${g.titleId}${g.firstSeason != null ? `?s=${g.firstSeason}` : ""}`);
</script>

<div class="page" style:padding="{TOP}px {PAD_X}px {BOTTOM}px">
	<div class="top">
		<div class="titles">
			<h1>{i18n.shell_downloads()}</h1>
			<span class="summary">{view.summary}</span>
		</div>
		{#if meter}
			<div class="meter">
				<StorageMeter usedPct={meter.usedPct} otherPct={meter.otherPct} labels={meter.labels} />
			</div>
		{/if}
	</div>

	{#if !net.online}
		<Banner
			status="paused"
			icon="wifi-off"
			title={i18n.dl_offline_title()}
			detail={i18n.dl_offline_detail()}
		/>
	{/if}

	{#if view.active.length > 0}
		<section class="active">
			<h2>{i18n.dl_downloading()}</h2>
			{#each view.active as r (r.key)}
				<div class="row {r.state}" data-key={r.key} data-state={r.state}>
					<span class="pic">
						<Art src={stillOf(r.key)} position={posOf(r.key)} />
						<span class="over">
							{#if r.state === "failed"}
								<span class="err"><Icon name="circle-alert" /></span>
							{:else}
								<span class="ring" style:--p="{r.pct}%">
									<span class="hole">
										{#if r.state === "waiting"}
											<Icon name="pause" filled />
										{/if}
									</span>
								</span>
							{/if}
						</span>
					</span>
					<span class="body">
						<span class="name">{r.title}</span>
						<span class="bar"><span class="fill" style:width="{r.pct}%"></span></span>
						<span class="line">
							<span class="sub">{r.sub}</span>
							<span class="note {r.noteTone}">{r.note}</span>
						</span>
					</span>
					{#if r.canRetry}
						<Button
							variant="secondary"
							size="sm"
							icon="rotate-cw"
							title={i18n.dl_retry_download()}
							onclick={() => retry(downloadsPort, r.key)}
						>
							{i18n.dl_retry()}
						</Button>
					{/if}
					<Button
						variant="icon"
						icon="x"
						label={i18n.dl_cancel()}
						title={i18n.dl_cancel()}
						onclick={() => cancel(r.key)}
					/>
				</div>
			{/each}
		</section>
	{/if}

	{#if view.groups.length > 0}
		<section class="done">
			<h2>{i18n.dl_on_device()}</h2>
			{#each view.groups as g (g.kind === "movies" ? "movies" : `${g.titleKind}:${g.titleId}`)}
				<div class="group">
					{#if g.kind === "show"}
						<div class="head">
							<button
								type="button"
								class="poster"
								aria-label={i18n.dl_open({ title: g.title })}
								onclick={() => openGroup(g)}
							>
								<span class="cover"><Art src={artworkAt(g.poster)} kind="poster" /></span>
							</button>
							<button type="button" class="gtitle" onclick={() => openGroup(g)}>
								<span class="gname">{g.title}</span>
								<span class="gsub">{g.sub}</span>
							</button>
							<Button variant="destructive" size="sm" icon="trash-2" onclick={() => removeAll(g)}>
								{i18n.dl_remove_all()}
							</Button>
						</div>
					{:else}
						<div class="head movies">
							<span class="gname">{g.title}</span>
							<span class="gsub">{g.sub}</span>
						</div>
					{/if}
					{#each g.seasons as s (s.label ?? "")}
						<div class="season">
							{#if s.label}
								<span class="label">{s.label}</span>
							{/if}
							<div class="grid">
								{#each s.cards as c (c.key)}
									<div class="card" data-key={c.key}>
										<button
											type="button"
											class="still"
											aria-label={i18n.library_play_title({ title: c.fullTitle })}
											onclick={() => play(c)}
										>
											<Art src={stillOf(c.key)} position={posOf(c.key)} />
											<span class="playdot"><Icon name="play" filled /></span>
											{#if c.watched}
												<span class="seen"><Icon name="tick" stroke={2.5} /></span>
											{/if}
										</button>
										<div class="info">
											<button type="button" class="text" onclick={() => open(c)}>
												<span class="head1">{c.head}</span>
												<span class="line1">{c.line}</span>
												<span class="mono">{c.meta}</span>
												<span class="mono clip">{c.tracks}</span>
												{#if c.offText}
													<span class="off"><Icon name="history" />{c.offText}</span>
												{/if}
											</button>
											<span class="trash">
												<Button
													variant="icon"
													icon="trash-2"
													label={i18n.dl_remove()}
													title={i18n.dl_remove()}
													onclick={() => removeOne(c.key)}
												/>
											</span>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/each}
		</section>
	{/if}

	{#if view.empty && dl.loaded}
		<div class="none">
			<EmptyState icon="download" title={i18n.dl_empty_title()} text={i18n.dl_empty_text()}>
				{#snippet action()}
					<Button variant="primary" onclick={() => goto("/library/movies")}>
						{i18n.dl_browse()}
					</Button>
				{/snippet}
			</EmptyState>
		</div>
	{/if}
</div>

<style>
.page {
	position: relative;
	box-sizing: border-box;
	min-height: 100%;
	display: flex;
	flex-direction: column;
	gap: 22px;
}

.none {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	pointer-events: none;
}

.none > :global(*) {
	pointer-events: auto;
}

.top {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	justify-content: space-between;
	gap: 14px 32px;
}

.titles {
	flex: 1 1 240px;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

h1 {
	margin: 0;
	font-size: 30px;
	font-weight: 700;
	letter-spacing: -0.025em;
}

.summary {
	font: 400 11.5px var(--font-mono);
	color: var(--fg-subtle);
}

.meter {
	flex: 1 1 300px;
	max-width: 440px;
	min-width: 0;
}

section {
	display: flex;
	flex-direction: column;
}

.active {
	gap: 6px;
}

.done {
	gap: 26px;
}

h2 {
	margin: 0;
	font: 500 10.5px var(--font-mono);
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--fg-faint);
}

.active h2 {
	margin-bottom: 4px;
}

.row {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 10px 0;
}

.pic {
	position: relative;
	flex: none;
	width: 150px;
	aspect-ratio: 16 / 9;
	border-radius: 8px;
	overflow: hidden;
	background: var(--bg-card);
}

.pic :global(img.loaded) {
	opacity: 0.7;
}

.over {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
}

.ring {
	display: grid;
	place-items: center;
	width: 30px;
	height: 30px;
	border-radius: 50%;
	background: conic-gradient(var(--player-accent) var(--p), var(--player-track) 0);
}

.hole {
	display: grid;
	place-items: center;
	width: 22px;
	height: 22px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--bg-deep) 85%, transparent);
	color: var(--player-ink);
	font-size: 11px;
}

.err {
	display: grid;
	place-items: center;
	width: 30px;
	height: 30px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--bg-deep) 85%, transparent);
	color: var(--status-failed);
	font-size: 20px;
}

.body {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 5px;
}

.name {
	font-size: 15px;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.bar {
	display: block;
	height: 3px;
	border-radius: 2px;
	background: color-mix(in srgb, var(--fg) 10%, transparent);
	overflow: hidden;
}

.fill {
	display: block;
	height: 100%;
	background: var(--status-downloading);
	transition: width 450ms linear;
}

.waiting .fill {
	background: var(--fg-subtle);
}

.failed .fill {
	background: var(--status-failed);
}

.line {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 2px 12px;
	font: 400 11.5px var(--font-mono);
}

.sub {
	color: var(--fg-subtle);
}

.note.rate {
	color: var(--accent-text);
}

.note.muted {
	color: var(--fg-subtle);
}

.note.failed {
	color: var(--status-failed);
}

.group {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.head {
	display: flex;
	align-items: center;
	gap: 14px;
	padding-bottom: 12px;
	border-bottom: 1px solid var(--border);
}

.head.movies {
	align-items: baseline;
	gap: 10px;
}

.poster {
	flex: none;
	padding: 0;
	border: 0;
	border-radius: var(--radius-sm);
	background: transparent;
	cursor: pointer;
}

.cover {
	position: relative;
	display: block;
	width: 40px;
	aspect-ratio: 2 / 3;
	border-radius: var(--radius-sm);
	overflow: hidden;
	box-shadow: 0 0 0 1px var(--border);
}

.gtitle {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 0;
	border: 0;
	background: transparent;
	color: var(--fg);
	text-align: left;
	cursor: pointer;
}

.gname {
	font-size: 17px;
	font-weight: 600;
	letter-spacing: -0.01em;
}

.gsub {
	font: 400 11.5px var(--font-mono);
	color: var(--fg-subtle);
}

.season {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.label {
	font: 500 10.5px var(--font-mono);
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--fg-subtle);
}

.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
	gap: 24px 16px;
}

.card {
	display: flex;
	flex-direction: column;
	gap: 9px;
	min-width: 0;
}

.still {
	position: relative;
	display: block;
	width: 100%;
	aspect-ratio: 16 / 9;
	padding: 0;
	border: 0;
	border-radius: var(--radius-md);
	overflow: hidden;
	background: var(--bg-card);
	cursor: pointer;
	box-shadow: 0 0 0 1px var(--border);
	transition: box-shadow var(--dur-fast);
}

.still:hover {
	box-shadow:
		0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent),
		0 16px 32px rgba(0, 0, 0, 0.45);
}

.playdot {
	position: absolute;
	left: 10px;
	bottom: 10px;
	display: grid;
	place-items: center;
	width: 30px;
	height: 30px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--fg) 92%, transparent);
	color: var(--fg-on-accent);
	font-size: 12px;
}

.playdot :global(.sl-ico) {
	margin-left: 2px;
}

.seen {
	position: absolute;
	right: 8px;
	top: 8px;
	display: grid;
	place-items: center;
	width: 22px;
	height: 22px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--bg-deep) 80%, transparent);
	color: var(--status-available);
	font-size: 13px;
}

.info {
	display: flex;
	align-items: flex-start;
	gap: 4px;
	min-width: 0;
}

.text {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 0;
	border: 0;
	background: transparent;
	color: var(--fg);
	text-align: left;
	cursor: pointer;
}

.head1 {
	font-size: 14px;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.line1 {
	font-size: 12.5px;
	color: var(--fg-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.mono {
	font: 400 11px var(--font-mono);
	color: var(--fg-subtle);
}

.clip {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.off {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-top: 3px;
	font-size: 12px;
	line-height: 1.35;
	color: var(--fg-muted);
}

.off :global(.sl-ico) {
	flex: none;
	font-size: 13px;
	color: var(--status-wanted);
	stroke-width: 2;
}

.trash {
	flex: none;
	display: inline-flex;
	margin: -4px -6px 0 0;
}

.trash :global(.sl-btn) {
	width: 34px;
	height: 34px;
}
</style>
