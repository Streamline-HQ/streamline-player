<script lang="ts">
import {
	admin,
	busy,
	clearCache,
	commit,
	draft,
	loadAdmin,
	refreshAdmin,
	refreshLibrary,
	refreshLogs,
	resetAdmin,
	resolvePairing,
	restart,
	scanDone,
	revoke,
	save,
	scan,
	setLevel,
	stop,
	tickStreams,
} from "#lib/core/admin.svelte.ts";
import { ask, countdown } from "#lib/core/ask.svelte.ts";
import { lib, loadLibrary } from "#lib/core/library.svelte.ts";
import { account, setMe } from "#lib/core/me.svelte.ts";
import {
	type Act,
	commitNumber,
	commitText,
	type SectionKey,
	sections,
	sizeText,
	status,
} from "#lib/core/server-view.ts";
import { toast } from "#lib/core/toast.svelte.ts";
import type { Kind, SettingValue } from "#lib/core/types.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import type { Handlers } from "#lib/screens/admin/handlers.ts";
import { adminPort } from "#lib/screens/admin/port.ts";
import ServerBlock from "#lib/screens/admin/ServerBlock.svelte";
import ServerNav from "#lib/screens/admin/ServerNav.svelte";
import { TONES } from "#lib/screens/admin/tone.ts";
import { IS_WEB } from "#lib/platform/target.ts";
import Button from "#lib/ui/Button.svelte";
import EmptyState from "#lib/ui/EmptyState.svelte";
import Icon from "#lib/ui/Icon.svelte";
import { goto } from "#lib/ui/nav.ts";
import { useScroll } from "#lib/ui/scroll.ts";
import { serverWords } from "#lib/ui/server-words.ts";
import {
	approvePairing,
	denyPairing,
	home,
	library,
	me as whoAmI,
	openExternal,
	serverHost,
	title as fetchTitle,
	watchState,
} from "#platform";
import { onMount } from "svelte";

const PAD_X = 56;
const TOP = 92;
const SPY_OFFSET = 120;
const REFRESH_MS = 10_000;
const SCAN_POLL_MS = 1_000;
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
const secs = $derived(data ? sections(data, find, now, getLocale(), words, admin.restarting) : []);
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

const fail = () => toast(i18n.settings_err_unknown(), { icon: "wifi", warning: true });
const first = (name: string) => name.split(" ")[0] ?? name;
const countText = (one: () => string, other: () => string, n: number) =>
	n === 1 ? one() : other();

async function saveKey(key: string, value: SettingValue) {
	const before = admin.data?.settings.values[key];
	if (before === value) return;
	const result = await save(adminPort, key, value);
	report(result, key, before);
}

function report(
	result: Awaited<ReturnType<typeof save>>,
	key: string,
	before: SettingValue | undefined,
) {
	const settings = admin.data?.settings;
	if (result === "ok") {
		if (settings && settings.values[key] !== before)
			toast(
				settings.pending.includes(key) ? i18n.server_toast_saved_restart() : i18n.settings_saved(),
			);
	} else if (result === "invalid") toast(i18n.server_toast_invalid(), { warning: true });
	else if (result === "failed") fail();
}

async function commitRow(row: Parameters<typeof commit>[1]) {
	const raw = admin.drafts[row.key];
	if (raw === undefined) return;
	const valid =
		row.t === "num"
			? commitNumber(
					raw,
					row.min ?? Number.MIN_SAFE_INTEGER,
					row.max ?? Number.MAX_SAFE_INTEGER,
				) !== null
			: commitText(raw, row.allowEmpty ?? false) !== null;
	const before = admin.data?.settings.values[row.key];
	const result = await commit(adminPort, row);
	if (valid) report(result, row.key, before);
}

function askStop(id: string) {
	const st = data?.streams.find((x) => x.id === id);
	if (!st) return;
	const t = find(st.title.kind, st.title.id)?.title ?? "—";
	const what = st.season !== undefined ? `${t} · S${st.season} E${st.episode}` : t;
	const name = first(st.user.name);
	const device = st.device.name;
	const you = st.user.you;
	ask({
		title: you ? i18n.server_ask_stop_title_you() : i18n.server_ask_stop_title({ name }),
		body: you
			? i18n.server_ask_stop_body_you({ what, device })
			: i18n.server_ask_stop_body({ what, device, name }),
		input: {
			label: you
				? i18n.server_ask_stop_label_you({ device })
				: i18n.server_ask_stop_label({ name }),
			placeholder: you ? i18n.server_ask_stop_ph_you() : i18n.server_ask_stop_ph(),
			presets: [
				i18n.server_preset_restarting(),
				i18n.server_preset_bandwidth(),
				i18n.server_preset_too_many(),
			],
		},
		confirm: i18n.server_ask_stop_confirm(),
		onconfirm: async (message) => {
			if (!(await stop(adminPort, id, message || undefined))) return fail();
			toast(
				you
					? i18n.server_toast_stopped_you()
					: message
						? i18n.server_toast_stopped_msg({ name })
						: i18n.server_toast_stopped({ name }),
			);
		},
	});
}

async function pair(code: string, approve: boolean) {
	const found = data?.pairings.find((p) => p.user_code === code);
	if (!found || !data) return;
	if (!IS_WEB) {
		const player = data.overview.server.player_url;
		if (!player) return toast(i18n.server_toast_no_player());
		openExternal(`${player.replace(/\/$/, "")}/pair?code=${encodeURIComponent(code)}`).catch(
			() => {},
		);
		return toast(i18n.welcome_finish_in_browser());
	}
	const who = account.me?.name ?? "";
	const result = await resolvePairing({ approvePairing, denyPairing }, code, approve, who);
	if (result === "ok")
		toast(
			approve
				? i18n.server_toast_paired({ device: found.name, name: who })
				: i18n.server_toast_denied({ code }),
		);
	else if (result === "gone") toast(i18n.approve_not_found(), { warning: true });
	else fail();
}

function askRestart() {
	const n = data?.streams.length ?? 0;
	const run = async (message: string) => {
		try {
			await restart(adminPort, message || undefined);
			toast(i18n.server_status_restarting());
		} catch {
			fail();
		}
	};
	const schedule = (message: string) =>
		countdown({
			title: i18n.server_cd_title(),
			seconds: 10,
			note: n
				? countText(
						() => i18n.server_cd_streams_one({ count: n }),
						() => i18n.server_cd_streams_other({ count: n }),
						n,
					)
				: i18n.server_cd_nobody(),
			ondone: () => void run(message),
			abortToast: i18n.server_cd_aborted(),
		});
	ask({
		title: i18n.server_ask_restart_title(),
		body: n
			? countText(
					() => i18n.server_ask_restart_body_one({ count: n }),
					() => i18n.server_ask_restart_body_other({ count: n }),
					n,
				)
			: i18n.server_ask_restart_body_none(),
		...(n
			? {
					input: {
						label: i18n.server_ask_restart_label(),
						placeholder: i18n.server_ask_restart_ph(),
						presets: [i18n.server_preset_update(), i18n.server_preset_minute()],
					},
				}
			: {}),
		confirm: i18n.server_act_restart(),
		onconfirm: schedule,
	});
}

async function startScan(folder: string | undefined) {
	const folders = data?.library.folders ?? [];
	if (!folders.some((f) => (folder === undefined || f.id === folder) && !f.scan)) return;
	const name = folders.find((f) => f.id === folder)?.name;
	if (!(await scan(adminPort, folder))) return fail();
	toast(name ? i18n.server_toast_scanning({ folder: name }) : i18n.server_toast_scanning_all());
}

async function cache() {
	const size = data?.overview.storage.cache.size ?? 0;
	if (!(await clearCache(adminPort))) return fail();
	toast(i18n.server_toast_cache({ size: sizeText(size, getLocale(), words) }));
}

async function download() {
	try {
		toast(i18n.server_toast_downloaded({ name: await adminPort.adminLogsDownload() }));
	} catch {
		fail();
	}
}

async function act(a: Act) {
	if (a.do === "go") jump(a.to);
	else if (a.do === "stop") askStop(a.id);
	else if (a.do === "approve" || a.do === "deny") await pair(a.code, a.do === "approve");
	else if (a.do === "revoke" || a.do === "end") {
		if (await revoke(adminPort, a.id))
			toast(a.do === "end" ? i18n.server_toast_ended() : i18n.server_toast_revoked());
		else fail();
	} else if (a.do === "restart") askRestart();
	else if (a.do === "clearcache") await cache();
	else if (a.do === "scan") await startScan(a.folder);
	else if (a.do === "download") await download();
}

const handlers: Handlers = {
	go: jump,
	act: (a) => void act(a),
	save: (key, value) => void saveKey(key, value),
	draft,
	commit: (row) => void commitRow(row),
	busy: (key) => busy.keys.includes(key),
};

let wasRestarting = false;
$effect(() => {
	const now = admin.restarting;
	if (wasRestarting && !now && admin.data) toast(i18n.server_toast_back());
	wasRestarting = now;
});

let polling = false;
async function pollScans() {
	if (polling || !data?.library.folders.some((f) => f.scan)) return;
	polling = true;
	try {
		await refreshLibrary(adminPort);
	} finally {
		polling = false;
	}
}

$effect(() => {
	const done = scanDone.report;
	if (!done) return;
	scanDone.report = null;
	toast(
		i18n.server_toast_scan_done({
			folders: new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(done.finished),
		}),
		{
			text: i18n.server_toast_scan_text({
				added: countText(
					() => i18n.server_new_files_one({ count: done.added }),
					() => i18n.server_new_files_other({ count: done.added }),
					done.added,
				),
				errors: countText(
					() => i18n.activity_errors_one({ count: done.errors }),
					() => i18n.activity_errors_other({ count: done.errors }),
					done.errors,
				),
			}),
		},
	);
});

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
	const scans = setInterval(() => visible() && pollScans(), SCAN_POLL_MS);
	const logs = setInterval(() => visible() && refreshLogs(adminPort), LOGS_MS);
	const tick = setInterval(tickStreams, TICK_MS);
	const box = getScroll?.();
	box?.addEventListener("scroll", spy, { passive: true });
	return () => {
		clearInterval(refresh);
		clearInterval(scans);
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
			{#if admin.restarting && admin.lateRestart}
				<div class="strip late" role="status">
					<span class="line">
						<Icon name="triangle-alert" size={15} stroke={2} />
						<span class="text">{i18n.server_late()}</span>
					</span>
				</div>
			{/if}
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

.strip.late {
	color: var(--status-warning);
	border-color: color-mix(in srgb, var(--status-warning) 30%, transparent);
	background: color-mix(in srgb, var(--status-warning) 8%, transparent);
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
