<script lang="ts">
import { Minus, Plus } from "@lucide/svelte";
import { m as i18n } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";

let {
	label,
	desc,
	value,
	zero,
	what,
	disabled = false,
	ondec,
	oninc,
	onreset,
}: {
	label: string;
	desc: string;
	value: string;
	zero: boolean;
	what: string;
	disabled?: boolean;
	ondec: () => void;
	oninc: () => void;
	onreset: () => void;
} = $props();
</script>

<div class="stepper" style:opacity={disabled ? 0.5 : 1}>
	<span class="text">
		<span class="label">{label}</span>
		{#if !zero}
			<span class="desc">{desc}</span>
		{/if}
	</span>
	<div class="box" style:pointer-events={disabled ? "none" : "auto"}>
		<button
			type="button"
			class="step"
			{disabled}
			aria-label={i18n.player_step_earlier({ what })}
			onclick={ondec}
		>
			<Minus size={14} strokeWidth={2.25} />
		</button>
		<span class="value" style:color={zero ? "var(--player-ink-muted)" : "var(--player-accent-text)"}
			>{value}</span
		>
		<button
			type="button"
			class="step"
			{disabled}
			aria-label={i18n.player_step_later({ what })}
			onclick={oninc}
		>
			<Plus size={14} strokeWidth={2.25} />
		</button>
	</div>
	<button
		type="button"
		class="reset"
		disabled={zero}
		style:opacity={zero ? 0 : 1}
		aria-label={i18n.player_reset_timing({ what: what.toLocaleLowerCase(getLocale()) })}
		onclick={onreset}
	>
		{i18n.player_reset()}
	</button>
</div>

<style>
.stepper {
	margin: 8px 4px 2px;
	padding-top: 8px;
	border-top: 1px solid var(--border);
	display: flex;
	align-items: center;
	gap: 10px;
	transition: opacity var(--dur-base);
}

.text {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.label {
	font-size: 13px;
	font-weight: 500;
	color: var(--player-ink);
}

.desc {
	font-size: 11.5px;
	line-height: 1.4;
	color: var(--fg-subtle);
	text-wrap: pretty;
}

.box {
	flex: none;
	display: flex;
	align-items: center;
	gap: 2px;
	padding: 3px;
	border-radius: 9px;
	background: var(--surface);
}

.step {
	width: 30px;
	height: 30px;
	display: grid;
	place-items: center;
	border: 0;
	border-radius: 7px;
	background: transparent;
	color: var(--player-ink);
	cursor: pointer;
}

.step:hover {
	background: var(--surface-2);
}

.value {
	min-width: 62px;
	text-align: center;
	font: 500 12px var(--font-mono);
	font-variant-numeric: tabular-nums;
}

.reset {
	flex: none;
	height: 30px;
	padding: 0 6px;
	border: 0;
	border-radius: 7px;
	background: transparent;
	color: var(--player-accent-text);
	font-size: 12px;
	font-weight: 500;
	cursor: pointer;
	transition: opacity var(--dur-fast);
}

.reset:hover {
	background: var(--surface-2);
}

.reset:disabled {
	pointer-events: none;
}
</style>
