<script lang="ts">
import { feed, loadActivity, markAllRead, markRead } from "#lib/core/activity.svelte.ts";
import { FILTERS, type Filter, feedView, type RowView } from "#lib/core/activity-view.ts";
import { lib, loadLibrary } from "#lib/core/library.svelte.ts";
import { toast } from "#lib/core/toast.svelte.ts";
import type { Kind } from "#lib/core/types.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import ActivityRow from "#lib/ui/ActivityRow.svelte";
import { activityWords } from "#lib/ui/activity-words.ts";
import Button from "#lib/ui/Button.svelte";
import EmptyState from "#lib/ui/EmptyState.svelte";
import type { IconName } from "#lib/ui/Icon.svelte";
import { goto } from "#lib/ui/nav.ts";
import { activity, artwork, home, library, markActivityRead, title, watchState } from "#platform";
import { onMount } from "svelte";

const PAD_X = 56;
const TOP = 92;
const BOTTOM = 32;
const MAX_WIDTH = 980;
const GAP = 3;
const port = { activity, markActivityRead };
const libraryPort = { library, watchState, home, title };

const LABELS = $derived<Record<Filter, string>>({
	all: i18n.library_all(),
	library: i18n.activity_filter_library(),
	downloads: i18n.shell_downloads(),
	system: i18n.settings_server(),
});

let filter = $state<Filter>("all");
const now = new Date();

const find = (kind: Kind, id: number) =>
	(kind === "movies" ? lib.movies : lib.shows).find((t) => t.id === id);
const view = $derived(feedView(feed.items, filter, find, now, getLocale(), activityWords()));
const index = $derived(FILTERS.indexOf(filter));

async function open(r: RowView) {
	markRead(port, [r.id]).then((ok) => {
		if (!ok) toast(i18n.settings_err_unknown(), { icon: "wifi", warning: true });
	});
	const to = r.open;
	if (!to) return;
	if (to.to === "detail")
		await goto(`/detail/${to.kind}/${to.id}${to.season ? `?s=${to.season}` : ""}`);
	else await goto(`/detail/${to.kind}/${to.id}`);
}

async function readAll() {
	if (!(await markAllRead(port)))
		toast(i18n.settings_err_unknown(), { icon: "wifi", warning: true });
}

onMount(() => {
	loadLibrary(libraryPort, lib.loaded);
	loadActivity(port, true);
});
</script>

<div class="page" style:padding="{TOP}px {PAD_X}px {BOTTOM}px" style:--max="{MAX_WIDTH}px">
	<div class="top">
		<div class="titles">
			<h1>{i18n.shell_activity()}</h1>
			<span class="summary">{view.summary}</span>
		</div>
		<div class="tools">
			<fieldset class="filters" aria-label={i18n.activity_filter()}>
				<span
					class="pill"
					style:width="calc((100% - {2 * GAP + GAP * (FILTERS.length - 1)}px) / {FILTERS.length})"
					style:transform="translateX(calc({index} * (100% + {GAP}px)))"
				></span>
				{#each FILTERS as f (f)}
					<button
						type="button"
						class:on={f === filter}
						aria-pressed={f === filter}
						onclick={() => (filter = f)}
					>
						{LABELS[f]}
					</button>
				{/each}
			</fieldset>
			<Button variant="secondary" icon="tick" disabled={view.unread === 0} onclick={readAll}>
				{i18n.activity_mark_all()}
			</Button>
		</div>
	</div>

	{#if feed.error !== null && !feed.loaded}
		<EmptyState icon="bell" title={i18n.activity_error()} text={feed.error}>
			{#snippet action()}
				<Button variant="secondary" onclick={() => loadActivity(port, true)}>
					{i18n.halt_try_again()}
				</Button>
			{/snippet}
		</EmptyState>
	{:else}
		{#each view.groups as g (g.group)}
			<section>
				<h2>{g.label}</h2>
				{#each g.rows as r (r.id)}
					<div class="slot">
						<ActivityRow
							head={r.head}
							name={r.name}
							text={r.text}
							at={r.at}
							poster={r.poster && r.titleKind ? artwork(r.titleKind, r.poster.id, "poster") : null}
							badge={r.badge as IconName | null}
							badgeTone={r.badgeTone}
							icon={r.icon as IconName}
							unread={r.unread}
							onclick={() => open(r)}
						/>
					</div>
				{/each}
			</section>
		{/each}
		{#if view.empty && feed.loaded}
			<EmptyState icon="bell" title={i18n.activity_empty()} />
		{/if}
	{/if}
</div>

<style>
.page {
	box-sizing: border-box;
	max-width: calc(var(--max) + 2 * 56px);
	min-height: 100%;
	margin: 0 auto;
	display: flex;
	flex-direction: column;
	gap: 22px;
}

.top {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	justify-content: space-between;
	gap: 14px 24px;
}

.titles {
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

.tools {
	display: flex;
	align-items: center;
	gap: 10px;
}

.filters {
	margin: 0;
	min-inline-size: 0;
	position: relative;
	display: grid;
	grid-auto-flow: column;
	grid-auto-columns: 1fr;
	gap: 3px;
	padding: 3px;
	border-radius: 9px;
	background: var(--bg-deep);
	border: 1px solid var(--border);
}

.pill {
	position: absolute;
	top: 3px;
	bottom: 3px;
	left: 3px;
	border-radius: 7px;
	background: var(--bg-selected);
	transition: transform 240ms var(--ease);
}

.filters button {
	position: relative;
	height: 30px;
	padding: 0 12px;
	border: 0;
	border-radius: 7px;
	background: transparent;
	transition: color 180ms;
	color: var(--fg-subtle);
	font-size: 12.5px;
	font-weight: 500;
	cursor: pointer;
	white-space: nowrap;
}

.filters button:hover,
.filters button.on {
	color: var(--fg);
}

section {
	display: flex;
	flex-direction: column;
}

h2 {
	margin: 0 0 6px;
	font: 500 10.5px var(--font-mono);
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--fg-faint);
}

.slot {
	margin: 0 -12px;
}
</style>
