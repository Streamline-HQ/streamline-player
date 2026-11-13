<script lang="ts">
import { lib, loadLibrary } from "#lib/core/library.svelte.ts";
import { setMe } from "#lib/core/me.svelte.ts";
import {
	admin,
	loadAdmin,
	refreshAdmin,
	refreshLogs,
	resetAdmin,
	setLevel,
	tickStreams,
} from "#lib/core/admin.svelte.ts";
import { type SectionKey, sections, status } from "#lib/core/server-view.ts";
import type { Kind } from "#lib/core/types.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import type { Handlers } from "#lib/screens/admin/handlers.ts";
import { adminPort } from "#lib/screens/admin/port.ts";
import ServerBlock from "#lib/screens/admin/ServerBlock.svelte";
import ServerNav from "#lib/screens/admin/ServerNav.svelte";
import { TONES } from "#lib/screens/admin/tone.ts";
import Button from "#lib/ui/Button.svelte";
import EmptyState from "#lib/ui/EmptyState.svelte";
import Icon from "#lib/ui/Icon.svelte";
import { goto } from "#lib/ui/nav.ts";
import { useScroll } from "#lib/ui/scroll.ts";
import { serverWords } from "#lib/ui/server-words.ts";
import {
	home,
	library,
	me as whoAmI,
	serverHost,
	title as fetchTitle,
	watchState,
} from "#platform";
import { onMount } from "svelte";

const PAD_X = 56;
const TOP = 92;
const SPY_OFFSET = 120;
const REFRESH_MS = 10_000;
const LOGS_MS = 3000;
const TICK_MS = 1000;
const libraryPort = { library, watchState, home, title: fetchTitle };

const getScroll = useScroll();

let active = $state<SectionKey>("overview");
let host = $state("");
let now = $state(new Date());
let why = $state(false);
let spyHeldUntil = 0;

const find = (kind: Kind, id: number) =>
	(kind === "movies" ? lib.movies : lib.shows).find((t) => t.id === id);
const words = $derived(serverWords());
const data = $derived(admin.data);
const secs = $derived(data ? sections(data, find, now, getLocale(), words) : []);
const health = $derived(data ? status(data, admin.restarting, words) : null);
const readOnly = $derived(
	!!data && (data.settings.read_only.streamline || data.settings.read_only.engine),
);
const groups = $derived(
	secs.reduce<{ name: string; items: typeof secs }[]>((out, s) => {
		const g = out.find((x) => x.name === s.group);
		if (g) g.items.push(s);
		else out.push({ name: s.group, items: [s] });
		return out;
	}, []),
);

function jump(key: SectionKey) {
	active = key;
	spyHeldUntil = Date.now() + 800;
	document
		.querySelector(`[data-sec="${key}"]`)
		?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function spy() {
	const box = getScroll?.();
	if (!box || Date.now() < spyHeldUntil) return;
	const els = [...box.querySelectorAll<HTMLElement>("[data-sec]")];
	if (!els.length) return;
	const limit = box.getBoundingClientRect().top + SPY_OFFSET;
	let current = els[0]!.dataset.sec as SectionKey;
	for (const el of els)
		if (el.getBoundingClientRect().top <= limit) current = el.dataset.sec as SectionKey;
	if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4)
		current = els.at(-1)!.dataset.sec as SectionKey;
	active = current;
}

const handlers: Handlers = { go: jump };

// A 403 means the role is gone: the account is read again so Settings stops offering this screen.
$effect(() => {
	if (!admin.forbidden) return;
	resetAdmin();
	whoAmI().then(
		(v) => setMe(v),
		() => {},
	);
	goto("/settings", { replace: true });
});

onMount(() => {
	loadLibrary(libraryPort, lib.loaded);
	serverHost().then((h) => (host = h));
	loadAdmin(adminPort);
	const visible = () => document.visibilityState === "visible";
	const refresh = setInterval(() => {
		if (!visible()) return;
		now = new Date();
		refreshAdmin(adminPort);
	}, REFRESH_MS);
	const logs = setInterval(() => visible() && refreshLogs(adminPort), LOGS_MS);
	const tick = setInterval(tickStreams, TICK_MS);
	const box = getScroll?.();
	box?.addEventListener("scroll", spy, { passive: true });
	return () => {
		clearInterval(refresh);
		clearInterval(logs);
		clearInterval(tick);
		box?.removeEventListener("scroll", spy);
	};
});
</script>

<svelte:head><title>{i18n.server_open()}</title></svelte:head>

<div class="server" style:padding="{TOP}px {PAD_X}px 64px">
	{#if admin.error !== null && !admin.loaded}
		<div class="solo">
			<EmptyState icon="server" title={i18n.server_load_failed()}>
				{#snippet action()}
					<Button variant="secondary" onclick={() => loadAdmin(adminPort)}>
						{i18n.halt_try_again()}
					</Button>
				{/snippet}
			</EmptyState>
		</div>
	{:else if !data || !health}
		<div class="solo loading">{i18n.server_loading()}</div>
	{:else}
		<ServerNav
			groups={groups.map((g) => ({ name: g.name, items: g.items }))}
			{active}
			{host}
			dot={TONES[health.tone].fg}
			title={i18n.settings_server()}
			backLabel={i18n.server_back()}
			label={i18n.server_nav_label()}
			top={TOP}
			onback={() => goto("/settings")}
			onopen={jump}
		/>
		<main>
			{#if readOnly}
				<div class="strip">
					<span class="line">
						<Icon name="lock" size={15} stroke={2} />
						<span class="text">{i18n.server_ro_strip()}</span>
						<button type="button" aria-expanded={why} onclick={() => (why = !why)}>
							{i18n.server_why()}
						</button>
					</span>
					{#if why}
						<span class="why">{i18n.server_ro_body()}</span>
					{/if}
				</div>
			{/if}
			<div class="blocks">
				{#each secs as sec, si (sec.key)}
					{#each sec.blocks as block, bi (bi)}
						{#if bi === 0}
							<div class="sec" class:first={si === 0} data-sec={sec.key}>
								<h2>{sec.title}</h2>
								<p>{sec.intro}</p>
							</div>
						{/if}
						<ServerBlock
							{block}
							h={handlers}
							drafts={admin.drafts}
							logs={admin.logs}
							level={admin.level}
							live={admin.live}
							onlevel={(l) => setLevel(adminPort, l)}
							onlive={() => (admin.live = !admin.live)}
						/>
					{/each}
				{/each}
			</div>
			<div class="foot">
				{i18n.server_footer({
					version: data.overview.server.version,
					config: data.overview.server.config_path,
				})}
			</div>
		</main>
	{/if}
</div>

<style>
.server {
	box-sizing: border-box;
	min-height: 100%;
	display: grid;
	grid-template-columns: 220px minmax(0, 800px);
	justify-content: start;
	gap: 48px;
	background: var(--bg-deep);
	color: var(--fg);
}

.solo {
	grid-column: 1 / -1;
}

.loading {
	height: 320px;
	display: grid;
	place-items: center;
	color: var(--fg-faint);
	font: 400 12px var(--font-mono);
}

main {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 22px;
}

.strip {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 11px 12px;
	border-radius: var(--radius-md);
	background: var(--surface);
	border: 1px solid var(--border-strong);
	color: var(--fg-muted);
	font-size: 12.5px;
	line-height: 1.5;
}

.line {
	display: flex;
	align-items: center;
	gap: 10px;
}

.line :global(.sl-ico) {
	flex: none;
}

.text {
	flex: 1;
	min-width: 0;
}

.strip button {
	flex: none;
	height: 26px;
	padding: 0 10px;
	border-radius: 8px;
	border: 1px solid currentColor;
	background: transparent;
	color: inherit;
	font: inherit;
	font-size: 12px;
	font-weight: 600;
	cursor: pointer;
}

.why {
	color: var(--fg-subtle);
}

.blocks {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 28px 14px;
	align-items: start;
}

.sec {
	display: flex;
	flex-direction: column;
	gap: 5px;
	padding: 30px 4px 0;
	scroll-margin-top: 92px;
}

.sec.first {
	padding-top: 0;
}

h2 {
	margin: 0;
	font: 500 10.5px var(--font-mono);
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--fg-faint);
}

.sec p {
	margin: 0;
	max-width: 640px;
	font-size: 13px;
	line-height: 1.5;
	color: var(--fg-subtle);
	text-wrap: pretty;
}

.foot {
	padding-top: 6px;
	font: 400 11.5px var(--font-mono);
	color: var(--fg-faint);
	text-align: center;
}
</style>
