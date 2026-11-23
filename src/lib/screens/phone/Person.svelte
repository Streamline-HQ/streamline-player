<script lang="ts">
import { monogram, seasonSpan } from "#lib/core/format.ts";
import { lib, loadLibrary } from "#lib/core/library.svelte.ts";
import type { Credit, Person } from "#lib/core/types.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import { titleCard } from "#lib/screens/title-card.svelte.ts";
import Button from "#lib/ui/Button.svelte";
import EmptyState from "#lib/ui/EmptyState.svelte";
import Icon from "#lib/ui/Icon.svelte";
import { hideBroken } from "#lib/ui/img.ts";
import { goto } from "#lib/ui/nav.ts";
import NotFound from "#lib/ui/NotFound.svelte";
import PosterCard from "#lib/ui/PosterCard.svelte";
import {
	artwork,
	headshot,
	home,
	library,
	person as fetchPerson,
	title,
	watchState,
} from "#platform";
import { afterNavigate } from "$app/navigation";

let { id }: { id: string } = $props();

let p = $state.raw<Person | null>(null);
let missing = $state(false);
let failed = $state<string | null>(null);
let fromApp = false;
let loadId = 0;

afterNavigate(({ from, to }) => {
	if (from && from.url.pathname === to?.url.pathname) return;
	fromApp = from !== null;
});

async function load(i: string) {
	const call = ++loadId;
	p = null;
	missing = false;
	failed = null;
	try {
		const found = await fetchPerson(i);
		if (call === loadId) p = found;
	} catch (e) {
		if (call !== loadId) return;
		if (String(e).includes('"not_found"')) missing = true;
		else failed = String(e);
	}
}

$effect(() => {
	load(id);
});

$effect(() => {
	loadLibrary({ library, watchState, home, title }, lib.loaded);
});

const now = new Date();
const titleOf = (c: Credit) =>
	(c.kind === "movies" ? lib.movies : lib.shows).find((t) => t.id === c.id);

const back = () => (fromApp ? history.back() : goto("/"));

const credits = $derived([...(p?.credits ?? [])].sort((a, b) => b.year - a.year));
const movies = $derived(credits.filter((c) => c.kind === "movies"));
const series = $derived(credits.filter((c) => c.kind === "series"));
const summary = $derived.by(() => {
	const parts = [
		movies.length
			? (movies.length === 1 ? i18n.person_movies_one : i18n.person_movies_other)({
					count: movies.length,
				})
			: "",
		series.length
			? (series.length === 1 ? i18n.person_series_one : i18n.person_series_other)({
					count: series.length,
				})
			: "",
	].filter(Boolean);
	const [a = "", b] = parts;
	return i18n.person_on_your_server({ list: b ? i18n.person_and({ a, b }) : a });
});
const mono = $derived(monogram(p?.name ?? "?"));
const known = $derived(
	(p?.known_for ?? []).map(({ title, year, kind, id }) => {
		const onServer = kind !== undefined && id !== undefined;
		return {
			title,
			year,
			poster: onServer ? artwork(kind, id, "poster") : undefined,
			onopen: onServer ? () => goto(`/detail/${kind}/${id}`) : undefined,
		};
	}),
);
const backdrop = $derived(credits[0]);
let bgHidden = $state(false);
$effect(() => {
	backdrop;
	bgHidden = false;
});

const open = (c: Credit) =>
	goto(
		`/detail/${c.kind}/${c.id}${c.kind === "series" && c.seasons?.length ? `?s=${c.seasons[0]}` : ""}`,
	);
const subOf = (c: Credit) =>
	c.kind === "series"
		? seasonSpan(c.seasons ?? [], c.total_seasons ?? c.seasons?.length ?? 0)
		: String(c.year);
</script>

{#snippet section(name: string, list: Credit[])}
	<section class="credits">
		<div class="head">
			<h2>{name}</h2>
			<span class="n">{list.length}</span>
		</div>
		<div class="grid">
			{#each list as c (`${c.kind}:${c.id}`)}
				{@const t = titleOf(c)}
				<PosterCard
					size="phone"
					full
					title={c.title}
					note={c.character}
					sub={subOf(c)}
					src={artwork(c.kind, c.id, "poster")}
					{...t ? titleCard(c.kind, t, now) : {}}
					badge={undefined}
					onclick={() => open(c)}
				/>
			{/each}
		</div>
	</section>
{/snippet}

<div class="person">
	{#if missing}
		<NotFound
			title={i18n.person_not_found()}
			label={i18n.detail_back_home()}
			icon="search"
			onback={() => goto("/")}
		/>
	{:else if failed !== null}
		<div class="state">
			<EmptyState icon="film" title={i18n.home_error_title()} text={failed}>
				{#snippet action()}
					<Button variant="secondary" onclick={() => load(id)}>{i18n.halt_try_again()}</Button>
				{/snippet}
			</EmptyState>
		</div>
	{:else if p}
		<div class="glow">
			{#if backdrop && !bgHidden}
				<img
					src={artwork(backdrop.kind, backdrop.id, "backdrop")}
					alt=""
					onerror={() => (bgHidden = true)}
				>
			{/if}
			<div class="fade"></div>
		</div>
		<div class="body">
			<button type="button" class="back" aria-label={i18n.common_back()} onclick={back}>
				<Icon name="chevron-left" size={20} stroke={2} />
			</button>
			<header>
				<span class="avatar" style:background={mono.bg} style:color={mono.fg}>
					{mono.initials}<img src={headshot(p.id)} alt="" onerror={hideBroken}>
				</span>
				<span class="eyebrow">
					{p.department === "Acting" ? i18n.person_acting() : p.department}
				</span>
				<h1>{p.name}</h1>
				<span class="summary">{summary}</span>
			</header>

			{#if known.length}
				<section class="known">
					<h2>{i18n.person_known_for()}</h2>
					<div class="strip">
						{#each known as k, i (i)}
							{#snippet card()}
								<span
									class="poster"
									style:background-image={k.poster ? `url(${k.poster})` : undefined}
								></span>
								<span class="text">
									<span class="t">{k.title}</span>
									<span class="s">
										{#if k.onopen}
											<span class="dot"></span>
										{/if}
										{(k.onopen ? i18n.person_phone_on_server : i18n.person_phone_not_in_library)({
											year: k.year,
										})}
									</span>
								</span>
							{/snippet}
							{#if k.onopen}
								<button type="button" class="item" onclick={k.onopen}>{@render card()}</button>
							{:else}
								<div class="item out">{@render card()}</div>
							{/if}
						{/each}
					</div>
				</section>
			{/if}

			{#if series.length}
				{@render section(i18n.person_series_on_server(), series)}
			{/if}
			{#if movies.length}
				{@render section(i18n.person_movies_on_server(), movies)}
			{/if}
		</div>
	{/if}
</div>

<style>
.person {
	position: relative;
	min-height: 100%;
	overflow: hidden;
	background: var(--bg-deep);
	color: var(--fg);
}

.state {
	display: grid;
	place-items: center;
	min-height: 100vh;
}

.glow {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	height: 420px;
	overflow: hidden;
	pointer-events: none;
}

.glow img {
	position: absolute;
	left: -60px;
	top: -60px;
	width: calc(100% + 120px);
	height: calc(100% + 120px);
	object-fit: cover;
	filter: blur(48px) saturate(1.3);
	opacity: 0.38;
}

.fade {
	position: absolute;
	inset: 0;
	background: linear-gradient(
		180deg,
		rgb(var(--bg-deep-rgb) / 35%) 0%,
		rgb(var(--bg-deep-rgb) / 78%) 55%,
		var(--bg-deep) 100%
	);
}

.body {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 28px;
	padding: calc(env(safe-area-inset-top) + 56px) 0 0;
}

.back {
	position: absolute;
	left: 12px;
	top: calc(env(safe-area-inset-top) + 6px);
	z-index: 2;
	display: grid;
	place-items: center;
	width: 44px;
	height: 44px;
	padding: 0;
	border: 0;
	border-radius: 50%;
	background: rgba(0, 0, 0, 0.45);
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	color: var(--fg);
	cursor: pointer;
}

header {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
	padding: 0 24px;
	text-align: center;
}

.avatar {
	position: relative;
	display: grid;
	place-items: center;
	width: 108px;
	height: 108px;
	margin-bottom: 6px;
	border-radius: 50%;
	overflow: hidden;
	font-size: 36px;
	font-weight: 600;
	box-shadow:
		0 0 0 1px var(--border-strong),
		0 16px 40px rgba(0, 0, 0, 0.45);
}

.avatar img {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.eyebrow {
	font: 500 10.5px / 1 var(--font-mono);
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--accent-text);
}

h1 {
	margin: 0;
	font-size: 30px;
	line-height: 1.08;
	font-weight: 700;
	letter-spacing: -0.025em;
	text-wrap: balance;
}

.summary {
	font: 400 11.5px var(--font-mono);
	color: var(--fg-muted);
}

h2 {
	margin: 0;
	font-size: 17px;
	font-weight: 600;
}

.known {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.known h2 {
	padding: 0 20px;
}

.strip {
	display: flex;
	gap: 8px;
	padding: 0 20px;
	overflow-x: auto;
	scrollbar-width: none;
}

.item {
	flex: none;
	width: 228px;
	display: flex;
	align-items: center;
	gap: 10px;
	min-height: 64px;
	padding: 8px 12px 8px 8px;
	border: 1px solid var(--border-strong);
	border-radius: 12px;
	background: var(--bg-elevated);
	color: var(--fg);
	text-align: left;
}

button.item {
	cursor: pointer;
}

.item.out {
	border-style: dashed;
	background: none;
}

.poster {
	flex: none;
	width: 31px;
	aspect-ratio: 2 / 3;
	border-radius: 4px;
	background: var(--bg-card) center / cover;
}

.out .poster {
	background: var(--bg-elevated);
	box-shadow: inset 0 0 0 1px var(--border);
}

.text {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.t {
	overflow: hidden;
	font-size: 13.5px;
	font-weight: 600;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.out .t {
	font-weight: 500;
	color: var(--fg-muted);
}

.s {
	display: flex;
	align-items: center;
	gap: 6px;
	font: 400 11px var(--font-mono);
	color: var(--fg-subtle);
}

.item:not(.out) .s {
	color: var(--status-available);
}

.dot {
	flex: none;
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: var(--status-available);
}

.credits {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 0 20px;
}

.head {
	display: flex;
	align-items: baseline;
	gap: 10px;
}

.n {
	font: 400 11.5px var(--font-mono);
	color: var(--fg-subtle);
}

.grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 16px 10px;
}
</style>
