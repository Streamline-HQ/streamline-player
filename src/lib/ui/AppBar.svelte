<script lang="ts">
import Avatar from "#lib/ui/Avatar.svelte";
import Button from "#lib/ui/Button.svelte";
import Icon from "#lib/ui/Icon.svelte";
import Kbd from "#lib/ui/Kbd.svelte";
import Mark from "#lib/ui/Mark.svelte";
import "#lib/ui/ui.css";

type Tab = { id: string; label: string; on: boolean };

let {
	tabs,
	padLeft,
	padRight,
	scrolled,
	searchLabel,
	searchKbd,
	hit,
	accountDot = false,
	activityLabel,
	activityDot,
	activityOn,
	downloadsLabel,
	showDownloads,
	downloadsDot = false,
	downloadsOn = false,
	account,
	accountLabel,
	menuOpen,
	accountOn = false,
	onhome,
	ontab,
	onsearch,
	onactivity,
	ondownloads,
	onmenu,
}: {
	tabs: Tab[];
	padLeft: number;
	padRight: number;
	scrolled: boolean;
	searchLabel: string;
	searchKbd?: string;
	hit?: number;
	accountDot?: boolean;
	activityLabel: string;
	activityDot: boolean;
	activityOn: boolean;
	downloadsLabel: string;
	showDownloads: boolean;
	downloadsDot?: boolean;
	downloadsOn?: boolean;
	account: { name: string; email: string; initials: string; color: string; picture?: string };
	accountLabel: string;
	menuOpen: boolean;
	accountOn?: boolean;
	onhome: () => void;
	ontab: (id: string) => void;
	onsearch: () => void;
	onactivity: () => void;
	ondownloads: () => void;
	onmenu: () => void;
} = $props();
</script>

<div class="bar" class:scrolled data-tauri-drag-region style:padding="0 {padRight}px 0 {padLeft}px">
	<button type="button" class="brand" onclick={onhome}>
		<Mark size={30} />
		<span class="name"><span>streamline</span><span class="sub">player</span></span>
	</button>
	<nav>
		{#each tabs as t (t.id)}
			<button type="button" class="tab" class:on={t.on} onclick={() => ontab(t.id)}>
				{t.label}
				<span class="line"></span>
			</button>
		{/each}
	</nav>
	<div class="grow"></div>
	<div class="actions">
		<button type="button" class="sl-searchbtn" class:compact={!searchKbd} onclick={onsearch}>
			<Icon name="search" />
			<span class="label">{searchLabel}</span>
			{#if searchKbd}
				<Kbd>{searchKbd}</Kbd>
			{/if}
		</button>
		<Button
			variant="icon"
			icon="bell"
			label={activityLabel}
			title={activityLabel}
			dot={activityDot}
			active={activityOn}
			{hit}
			onclick={onactivity}
		/>
		{#if showDownloads}
			<Button
				variant="icon"
				icon="download"
				label={downloadsLabel}
				title={downloadsLabel}
				dot={downloadsDot ? "var(--status-downloading)" : false}
				active={downloadsOn}
				{hit}
				onclick={ondownloads}
			/>
		{/if}
		<button
			type="button"
			class="account"
			aria-label={accountLabel}
			aria-haspopup="menu"
			aria-expanded={menuOpen}
			style:width={hit ? `${hit}px` : undefined}
			style:height={hit ? `${hit}px` : undefined}
			onclick={onmenu}
		>
			<Avatar {...account} size={32} ring={menuOpen || accountOn} />
			{#if accountDot}
				<span class="pending"></span>
			{/if}
		</button>
	</div>
</div>

<style>
.bar {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	height: 64px;
	z-index: 20;
	display: flex;
	align-items: center;
	gap: 30px;
	transition:
		background var(--dur-base),
		box-shadow var(--dur-base);
}

/* Taller than the bar, so the tabs and the account read over a bright hero; gone once the bar turns solid. */
.bar::before {
	content: "";
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	height: 150px;
	z-index: -1;
	pointer-events: none;
	background: linear-gradient(
		180deg,
		color-mix(in srgb, var(--bg-deep) 84%, transparent) 0%,
		color-mix(in srgb, var(--bg-deep) 62%, transparent) 38%,
		color-mix(in srgb, var(--bg-deep) 22%, transparent) 72%,
		transparent 100%
	);
	transition: opacity var(--dur-base);
}

.bar.scrolled::before {
	opacity: 0;
}

.bar:not(.scrolled) .account :global(.sl-avatar:not(.ring)) {
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--bg-deep) 55%, transparent);
}

.bar.scrolled {
	background: color-mix(in srgb, var(--bg-deep) 78%, transparent);
	backdrop-filter: blur(16px) saturate(150%);
	box-shadow: inset 0 -1px 0 var(--border);
}

.brand {
	display: flex;
	align-items: center;
	gap: 10px;
	border: 0;
	background: transparent;
	padding: 0;
	cursor: pointer;
}

.name {
	display: flex;
	align-items: baseline;
	gap: 5px;
	font-size: 16px;
	font-weight: 600;
	letter-spacing: -0.02em;
	color: var(--fg);
	white-space: nowrap;
}

.sub {
	font-weight: 400;
	color: var(--fg-subtle);
}

nav {
	display: flex;
	align-items: center;
	gap: 4px;
	height: 100%;
}

.tab {
	position: relative;
	height: 100%;
	padding: 0 12px;
	border: 0;
	background: transparent;
	cursor: pointer;
	font-size: 14px;
	font-weight: 500;
	color: var(--fg-muted);
}

.tab:hover {
	color: var(--fg);
}

.tab.on {
	color: var(--fg);
	font-weight: 600;
}

.line {
	position: absolute;
	left: 12px;
	right: 12px;
	bottom: 14px;
	height: 2px;
	border-radius: 2px;
	background: var(--accent);
	opacity: 0;
}

.on .line {
	opacity: 1;
}

.grow {
	flex: 1;
}

.actions {
	display: flex;
	align-items: center;
	gap: 6px;
}

.actions :global(.sl-btn.on) {
	background: var(--accent-soft);
	color: var(--accent-text);
}

.sl-searchbtn {
	display: flex;
	align-items: center;
	flex: none;
	min-width: 210px;
	height: 38px;
	padding: 0 12px;
	gap: 8px;
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	/* Near solid: over a bright hero a see-through field leaves its label unreadable. */
	background: color-mix(in srgb, var(--bg-selected) 82%, transparent);
	box-shadow: inset 0 0 0 1px var(--border-strong);
	backdrop-filter: blur(16px) saturate(160%);
	-webkit-backdrop-filter: blur(16px) saturate(160%);
	color: var(--fg-muted);
	font-size: 13px;
	white-space: nowrap;
	overflow: hidden;
	cursor: pointer;
}

.sl-searchbtn.compact {
	min-width: 44px;
}

.sl-searchbtn:hover {
	background: color-mix(in srgb, var(--bg-selected) 88%, transparent);
	color: var(--fg);
}

.sl-searchbtn :global(.sl-ico) {
	font-size: 16px;
}

.sl-searchbtn :global(.sl-kbd) {
	margin-left: auto;
}

.label {
	flex: 1;
	text-align: left;
}

.account {
	position: relative;
	width: 40px;
	height: 40px;
	display: grid;
	place-items: center;
	padding: 0;
	border: 0;
	background: transparent;
	cursor: pointer;
	border-radius: var(--radius-md);
}

.pending {
	position: absolute;
	top: 1.5px;
	right: 1.5px;
	width: 9px;
	height: 9px;
	border-radius: 50%;
	background: var(--accent);
	pointer-events: none;
}
</style>
