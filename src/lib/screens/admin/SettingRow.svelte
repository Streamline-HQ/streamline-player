<script lang="ts">
import type { Act, Row } from "#lib/core/server-view.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import type { Handlers } from "#lib/screens/admin/handlers.ts";
import { TONES } from "#lib/screens/admin/tone.ts";
import Button from "#lib/ui/Button.svelte";
import ChoicePills from "#lib/ui/ChoicePills.svelte";
import Icon from "#lib/ui/Icon.svelte";

type Std = Extract<Row, { t: "toggle" | "choice" | "text" | "num" | "kv" | "action" | "list" }>;

let {
	row,
	draft,
	h,
}: {
	row: Std;
	draft?: string;
	h: Handlers;
} = $props();

const editable = $derived(
	row.t === "toggle" ||
		row.t === "choice" ||
		row.t === "text" ||
		row.t === "num" ||
		row.t === "list"
		? row
		: null,
);
const off = $derived(
	!!editable && (editable.disabled || editable.locked || !!h.busy?.(editable.key)),
);
const on = $derived(row.t === "toggle" && row.value === true);
const blurOnEnter = (e: KeyboardEvent) => {
	if (e.key === "Enter") (e.currentTarget as HTMLElement).blur();
};

async function add() {
	if (row.t !== "list") return;
	const value = (draft ?? "").trim();
	if (!value) return;
	if (row.items.includes(value)) return h.draft?.(row.key, "");
	const saved = await h.save?.(row.key, [...row.items, value]);
	if (saved !== false) h.draft?.(row.key, "");
}
const addOnEnter = (e: KeyboardEvent) => {
	if (e.key === "Enter") void add();
};
</script>

<div class="wrap">
	<div class="std">
		<span class="text">
			<span class="line">
				<span class="label">{row.label}</span>
				{#if editable?.restart}
					<span class="after">{i18n.server_after_restart()}</span>
				{/if}
			</span>
			{#if row.desc}
				<span class="desc">{row.desc}</span>
			{/if}
		</span>

		{#if editable?.locked}
			<span class="lock" title={i18n.server_ro_lock()}><Icon name="lock" size={14} /></span>
		{/if}

		{#if row.t === "toggle"}
			<button
				type="button"
				class="switch"
				class:on
				role="switch"
				aria-checked={on}
				aria-label={row.label}
				disabled={off}
				onclick={() => h.save?.(row.key, !on)}
			>
				<span class="knob"></span>
			</button>
		{:else if row.t === "choice"}
			<ChoicePills
				options={row.options ?? []}
				value={String(row.value)}
				label={row.label}
				disabled={off}
				compact
				onchange={(v) => h.save?.(row.key, v)}
			/>
		{:else if row.t === "kv"}
			<span class="kv">
				{#if row.pill}
					<span
						class="pill"
						style:color={TONES[row.pill[1]].fg}
						style:background={TONES[row.pill[1]].bg}
						style:border-color={TONES[row.pill[1]].line}
						>{row.pill[0]}</span
					>
				{/if}
				<span class="value">{row.value}</span>
			</span>
		{:else if row.t === "text" && !row.wide}
			<input
				class="short"
				value={draft ?? String(row.value)}
				placeholder={row.placeholder}
				disabled={off}
				spellcheck="false"
				autocomplete="off"
				aria-label={row.label}
				oninput={(e) => h.draft?.(row.key, e.currentTarget.value)}
				onblur={() => h.commit?.(row)}
				onkeydown={blurOnEnter}
			>
		{:else if row.t === "num"}
			<span class="num">
				<input
					value={draft ?? String(row.value)}
					inputmode="numeric"
					autocomplete="off"
					disabled={off}
					aria-label={row.label}
					oninput={(e) => h.draft?.(row.key, e.currentTarget.value)}
					onblur={() => h.commit?.(row)}
					onkeydown={blurOnEnter}
				>
				{#if row.unit}
					<span class="unit">{row.unit}</span>
				{/if}
			</span>
		{:else if row.t === "action"}
			<Button
				variant={row.tone === "danger" ? "destructive" : "secondary"}
				size="sm"
				disabled={row.disabled}
				onclick={() => h.act?.(row.act as Act)}
			>
				{row.button}
			</Button>
		{/if}
	</div>

	{#if row.t === "text" && row.wide}
		<input
			class="wide"
			value={draft ?? String(row.value)}
			placeholder={row.placeholder}
			disabled={off}
			spellcheck="false"
			autocomplete="off"
			aria-label={row.label}
			oninput={(e) => h.draft?.(row.key, e.currentTarget.value)}
			onblur={() => h.commit?.(row)}
			onkeydown={blurOnEnter}
		>
	{:else if row.t === "list"}
		<div class="list">
			<ul aria-label={row.label}>
				{#each row.items as item (item)}
					<li>
						{item}
						<button
							type="button"
							aria-label={i18n.server_list_remove({ value: item })}
							disabled={off}
							onclick={() =>
								h.save?.(
									row.key,
									row.items.filter((x) => x !== item),
								)}
						>
							<Icon name="x" size={14} stroke={2} />
						</button>
					</li>
				{:else}
					<li class="none">{i18n.server_list_empty()}</li>
				{/each}
			</ul>
			<div class="add">
				<input
					value={draft ?? ""}
					placeholder={row.placeholder}
					disabled={off}
					spellcheck="false"
					autocomplete="off"
					aria-label={i18n.server_list_add_to({ label: row.label.toLocaleLowerCase() })}
					oninput={(e) => h.draft?.(row.key, e.currentTarget.value)}
					onkeydown={addOnEnter}
				>
				<Button variant="secondary" size="sm" disabled={off} onclick={() => void add()}>
					{i18n.server_list_add()}
				</Button>
			</div>
		</div>
	{/if}
</div>

<style>
.wrap {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.wide {
	width: 100%;
	box-sizing: border-box;
	font-size: 12px;
}

.list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

ul {
	margin: 0;
	padding: 0;
	list-style: none;
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

li {
	height: 30px;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 0 4px 0 10px;
	border-radius: 8px;
	background: var(--bg-deep);
	border: 1px solid var(--border-strong);
	font: 400 12px var(--font-mono);
	color: var(--fg);
}

li.none {
	padding: 0;
	border: 0;
	background: none;
	font: inherit;
	font-size: 12.5px;
	color: var(--fg-faint);
}

li button {
	width: 24px;
	height: 24px;
	display: grid;
	place-items: center;
	border: 0;
	border-radius: 6px;
	background: transparent;
	color: var(--fg-subtle);
	cursor: pointer;
}

li button:hover:not(:disabled) {
	background: var(--surface-2);
	color: var(--fg);
}

li button:disabled {
	opacity: 0.45;
	cursor: default;
}

.add {
	display: flex;
	gap: 8px;
}

.std {
	display: flex;
	align-items: center;
	gap: 10px 16px;
	flex-wrap: wrap;
}

.text {
	flex: 1 1 220px;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.line {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.label {
	font-size: 14px;
	font-weight: 500;
}

.after {
	height: 19px;
	display: inline-flex;
	align-items: center;
	padding: 0 6px;
	border-radius: 5px;
	background: color-mix(in srgb, var(--status-warning) 10%, transparent);
	border: 1px solid color-mix(in srgb, var(--status-warning) 32%, transparent);
	color: var(--status-warning);
	font: 500 10px var(--font-mono);
}

.desc {
	font-size: 12.5px;
	line-height: 1.5;
	color: var(--fg-subtle);
	text-wrap: pretty;
}

.lock {
	flex: none;
	display: inline-flex;
	color: var(--fg-faint);
}

.switch {
	flex: none;
	width: 44px;
	height: 26px;
	padding: 2px;
	border: 0;
	border-radius: var(--radius-full);
	background: rgba(255, 255, 255, 0.16);
	cursor: pointer;
	display: flex;
	transition: background var(--dur-base) var(--ease);
}

.switch.on {
	background: var(--accent);
}

.switch:disabled {
	opacity: 0.45;
	cursor: default;
}

.knob {
	width: 22px;
	height: 22px;
	border-radius: 50%;
	background: var(--player-ink);
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
	transition: transform var(--dur-base) var(--ease);
}

.on .knob {
	transform: translateX(18px);
}

.kv {
	flex: 0 1 auto;
	min-width: 0;
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 8px;
	flex-wrap: wrap;
}

.pill {
	height: 20px;
	display: inline-flex;
	align-items: center;
	padding: 0 7px;
	border-radius: var(--radius-sm);
	border: 1px solid;
	font: 500 10.5px var(--font-mono);
}

.value {
	min-width: 0;
	font: 400 12.5px var(--font-mono);
	color: var(--fg-muted);
	text-align: right;
	overflow-wrap: anywhere;
}

input {
	height: 34px;
	box-sizing: border-box;
	padding: 0 11px;
	border-radius: 9px;
	border: 1px solid var(--border-strong);
	background: var(--bg-deep);
	color: var(--fg);
	font: 400 12.5px var(--font-mono);
	outline: none;
}

input:focus {
	border-color: var(--accent);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

input:disabled {
	opacity: 0.45;
}

.short {
	flex: none;
	width: 220px;
	max-width: 100%;
}

.num {
	flex: none;
	display: flex;
	align-items: center;
	gap: 8px;
}

.num input {
	width: 76px;
	padding: 0 10px;
	font-variant-numeric: tabular-nums;
	text-align: right;
}

.unit {
	min-width: 18px;
	font: 400 12px var(--font-mono);
	color: var(--fg-subtle);
}

.add input {
	flex: 1 1 auto;
	min-width: 0;
	font-size: 12px;
}
</style>
