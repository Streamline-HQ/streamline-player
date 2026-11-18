<script lang="ts">
import { isTablet } from "#lib/platform/form-factor.svelte.ts";
import { checkAddress } from "#lib/core/pairing.svelte.ts";
import { toast } from "#lib/core/toast.svelte.ts";
import type { DeviceInfo, Me } from "#lib/core/types.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import Icon from "#lib/ui/Icon.svelte";
import Mark from "#lib/ui/Mark.svelte";
import { goto } from "#lib/ui/nav.ts";
import SignIn from "#lib/screens/SignIn.svelte";
import { authState, connect, deviceInfo, me as whoAmI, signOut } from "#platform";
import { onMount } from "svelte";

type Step = "server" | "pair" | "paired";

const APP_VERSION = import.meta.env.VITE_APP_VERSION;
const FOUND_PAUSE_MS = 750;
const GO_SECS = 8;

let step = $state<Step | null>(null);
let url = $state("");
let checking = $state(false);
let found = $state(false);
let rtt = $state(0);
let error = $state("");
let input = $state<HTMLInputElement>();
let platform = $state("");
let account = $state<Pick<Me, "name" | "email" | "initials">>({
	name: "",
	email: "",
	initials: "",
});
let keystore = $state("");
let deviceName = $state("");
let goLeft = $state<number | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
let goTimer: ReturnType<typeof setInterval> | undefined;

const host = $derived(url.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, ""));
const firstName = $derived(account.name.split(" ")[0] ?? "");
function stopGo() {
	clearInterval(goTimer);
	goLeft = null;
}

function startGo() {
	stopGo();
	goLeft = GO_SECS;
	goTimer = setInterval(() => {
		const left = (goLeft ?? 1) - 1;
		if (left <= 0) {
			stopGo();
			goto("/", { replace: true });
		} else goLeft = left;
	}, 1000);
}

function toPair() {
	step = "pair";
}

function changeServer() {
	clearTimeout(timer);
	found = false;
	error = "";
	step = "server";
}

async function submit() {
	if (checking || found) return;
	const bad = checkAddress(url);
	if (bad) {
		error = bad === "empty" ? i18n.welcome_enter_address() : i18n.welcome_bad_address();
		return;
	}
	checking = true;
	error = "";
	try {
		rtt = Number(await connect(url.trim()));
		found = true;
		timer = setTimeout(toPair, FOUND_PAUSE_MS);
	} catch (e) {
		error =
			String(e) === "not_streamline"
				? i18n.welcome_not_streamline({ host })
				: i18n.welcome_unreachable({ host });
	} finally {
		checking = false;
	}
}

async function signedIn(result?: { name: string }) {
	deviceName = result?.name ?? "";
	const [me, state] = await Promise.all([
		whoAmI().catch(() => ({ name: "", email: "", initials: "" })),
		authState(),
	]);
	account = { name: me.name, email: me.email, initials: me.initials };
	keystore = state.store_error
		? i18n.common_key_not_stored({ error: state.store_error })
		: state.keystore;
	step = "paired";
	startGo();
}

async function leave() {
	stopGo();
	await signOut();
	toast(i18n.shell_signed_out_key_removed());
	toPair();
}

$effect(() => {
	if (step === "server") input?.focus();
});

onMount(() => {
	deviceInfo()
		.then((i: DeviceInfo) => (platform = i.platform))
		.catch(() => {});
	authState().then((s) => {
		url = (s.server ?? "").replace(/^https:\/\//, "");
		if (s.paired) goto("/", { replace: true });
		else if (s.server) toPair();
		else step = "server";
	});
	return () => {
		clearTimeout(timer);
		clearInterval(goTimer);
	};
});
</script>

{#if step === "pair"}
	<SignIn next="/" done={signedIn} change={changeServer} />
{:else}
	<div class="page" style:padding-top="{isTablet() ? 24 : 36}px">
		<div class="glow"></div>
		{#if step === "server"}
			<form
				class="card server"
				onsubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<div class="top">
					<Mark size={48} />
					<span class="eyebrow">{i18n.welcome_step_1()}</span>
				</div>
				<div class="head">
					<h1>{i18n.welcome_title_server()}</h1>
					<p class="lead">{i18n.welcome_server_lead()}</p>
				</div>
				<label class="field">
					<span class="label">{i18n.welcome_server_label()}</span>
					<span class="box" class:error>
						<Icon name="globe" size={17} stroke={1.75} />
						{#if !url.includes("://")}
							<span class="scheme">https://</span>
						{/if}
						<input
							bind:this={input}
							bind:value={url}
							oninput={() => {
								found = false;
								error = "";
							}}
							spellcheck="false"
							autocomplete="off"
							placeholder={i18n.welcome_server_placeholder()}
						>
					</span>
					<span class="help" class:error>{error || i18n.welcome_server_help()}</span>
				</label>
				{#if found}
					<div class="found">
						<Icon name="check" size={17} stroke={2} />
						<span class="found-text">{i18n.welcome_found()}</span>
						<span class="rtt">{rtt} ms</span>
					</div>
				{/if}
				<button type="submit" class="primary" style:opacity={checking ? 0.75 : 1}>
					{#if checking}
						<span class="spin"></span>
					{/if}
					{checking
						? i18n.welcome_checking()
						: found
							? i18n.welcome_connected()
							: i18n.welcome_continue()}
				</button>
				<div class="foot">
					<span>{i18n.welcome_footer_version({ version: APP_VERSION })}</span
					><span>{platform}</span>
				</div>
			</form>
		{:else if step === "paired"}
			<div class="card done">
				<span class="tick"><Icon name="tick" size={28} stroke={2.25} /></span>
				<div class="head center">
					<h1>{i18n.welcome_paired_title()}</h1>
					<p class="lead">
						{(isTablet() ? i18n.welcome_paired_lead_tablet : i18n.welcome_paired_lead)({ host })}
					</p>
				</div>
				<div class="facts">
					<div class="who">
						<span class="avatar">{account.initials}</span>
						<span class="names"
							><span class="name">{account.name}</span
							><span class="email">{account.email}</span></span
						>
					</div>
					<div class="row">
						<span class="k">{i18n.welcome_device_name()}</span><span>{deviceName}</span>
					</div>
					<div class="row last">
						<span class="k">{i18n.welcome_key_stored_in()}</span><span>{keystore}</span>
					</div>
				</div>
				<button
					type="button"
					class="primary go"
					onclick={() => {
						stopGo();
						goto("/", { replace: true });
					}}
				>
					{#if goLeft !== null}
						<span class="fill"></span>
					{/if}
					<span class="rel">{i18n.welcome_start_watching()}</span>
					{#if goLeft !== null}
						<span class="rel secs">{goLeft} s</span>
					{/if}
				</button>
				<span class="notyou">
					<span>{i18n.welcome_not_you({ name: firstName })}</span>
					<button type="button" class="link" onclick={leave}>{i18n.shell_sign_out()}</button>
				</span>
			</div>
		{/if}
	</div>
{/if}

<style>
.page {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 36px 24px 24px;
	overflow: hidden;
	background: var(--bg-deep);
	color: var(--fg);
}

.glow {
	position: absolute;
	left: 50%;
	top: -180px;
	width: 900px;
	height: 900px;
	margin-left: -450px;
	border-radius: 50%;
	background: radial-gradient(
		closest-side,
		color-mix(in srgb, var(--accent) 22%, transparent),
		color-mix(in srgb, var(--accent) 6%, transparent) 55%,
		transparent 100%
	);
	pointer-events: none;
}

.card {
	position: relative;
	display: flex;
	flex-direction: column;
	border-radius: var(--radius-xl);
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	box-shadow: var(--shadow-4);
}

.server {
	width: 440px;
	gap: 20px;
	padding: 32px;
}

.top {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.eyebrow {
	font: 500 10.5px var(--font-mono);
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--fg-faint);
}

.head {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

h1 {
	margin: 0;
	font-size: 24px;
	font-weight: 600;
	letter-spacing: -0.02em;
}

.lead {
	margin: 0;
	font-size: 14px;
	line-height: 1.55;
	color: var(--fg-muted);
}

.field {
	display: flex;
	flex-direction: column;
	gap: 7px;
}

.label {
	font-size: 13px;
	font-weight: 500;
	color: var(--fg-muted);
}

.box {
	height: 44px;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 0 12px;
	border-radius: var(--radius-md);
	background: var(--bg-deep);
	border: 1px solid var(--border-strong);
	color: var(--fg-subtle);
}

.box:focus-within {
	border-color: var(--accent);
	box-shadow: 0 0 0 2px var(--accent-ring);
}

.box.error {
	border-color: var(--status-failed);
	box-shadow: none;
}

.scheme {
	font: 400 13px var(--font-mono);
	color: var(--fg-faint);
}

input {
	flex: 1;
	min-width: 0;
	height: 100%;
	padding: 0;
	border: 0;
	outline: none;
	background: transparent;
	color: var(--fg);
	font: 400 14px var(--font-mono);
}

.help {
	font-size: 12px;
	color: var(--fg-subtle);
}

.help.error {
	color: var(--status-failed);
}

.found {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	border-radius: var(--radius-md);
	background: color-mix(in srgb, var(--status-available) 8%, transparent);
	border: 1px solid color-mix(in srgb, var(--status-available) 25%, transparent);
	font-size: 13px;
	color: var(--status-available);
}

.found-text {
	flex: 1;
	color: var(--fg);
}

.rtt {
	font: 400 11.5px var(--font-mono);
	color: var(--fg-subtle);
}

.primary {
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
}

.primary {
	height: 44px;
	gap: 9px;
	border: 0;
	border-radius: var(--radius-md);
	background: var(--accent);
	color: var(--fg-on-accent);
	font-size: 15px;
	font-weight: 600;
}

.primary:hover {
	background: var(--accent-hover);
	box-shadow: 0 0 24px color-mix(in srgb, var(--accent) 35%, transparent);
}

.spin {
	width: 15px;
	height: 15px;
	border-radius: 50%;
	border: 2px solid color-mix(in srgb, var(--bg-deep) 30%, transparent);
	border-top-color: var(--bg-deep);
	animation: spin 700ms linear infinite;
}

.foot {
	display: flex;
	justify-content: space-between;
	font: 400 11px var(--font-mono);
	color: var(--fg-faint);
}

.link {
	height: 24px;
	padding: 0 6px;
	border: 0;
	border-radius: var(--radius-sm);
	background: transparent;
	color: var(--accent-text);
	font: 500 12px var(--font-sans);
	cursor: pointer;
}

.link:hover {
	background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.done {
	width: 440px;
	align-items: center;
	gap: 18px;
	padding: 36px 32px 30px;
	text-align: center;
	animation: sl-rise var(--dur-slow) var(--ease);
}

.tick {
	width: 56px;
	height: 56px;
	display: grid;
	place-items: center;
	border-radius: 50%;
	background: color-mix(in srgb, var(--status-available) 12%, transparent);
	color: var(--status-available);
	box-shadow: 0 0 0 6px color-mix(in srgb, var(--status-available) 6%, transparent);
}

.facts {
	width: 100%;
	display: flex;
	flex-direction: column;
	border-radius: 12px;
	border: 1px solid var(--border);
	background: var(--bg-base);
	text-align: left;
}

.who {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 14px;
	border-bottom: 1px solid var(--border);
}

.avatar {
	width: 36px;
	height: 36px;
	border-radius: var(--radius-md);
	display: grid;
	place-items: center;
	background: var(--fg-muted);
	color: var(--fg-on-accent);
	font-size: 13px;
	font-weight: 600;
}

.names {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.name {
	font-size: 14px;
	font-weight: 500;
}

.email {
	font: 400 11.5px var(--font-mono);
	color: var(--fg-subtle);
}

.row {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	padding: 10px 14px;
	font-size: 13px;
	border-bottom: 1px solid var(--border);
}

.row.last {
	border-bottom: 0;
}

.k {
	color: var(--fg-subtle);
}

.go {
	position: relative;
	overflow: hidden;
	width: 100%;
	gap: 10px;
}

.fill {
	position: absolute;
	inset: 0;
	background: rgba(255, 255, 255, 0.24);
	transform-origin: 0 50%;
	animation: fill 8s linear forwards;
}

.rel {
	position: relative;
}

.secs {
	font: 500 12.5px var(--font-mono);
	font-variant-numeric: tabular-nums;
	opacity: 0.7;
}

.notyou {
	display: flex;
	align-items: center;
	gap: 4px;
	margin-top: -6px;
	font-size: 13px;
	color: var(--fg-subtle);
}

.notyou .link {
	height: 32px;
	border-radius: 7px;
	font-size: 13px;
}

.center {
	text-align: center;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

@keyframes fill {
	from {
		transform: scaleX(0);
	}
	to {
		transform: scaleX(1);
	}
}
</style>
