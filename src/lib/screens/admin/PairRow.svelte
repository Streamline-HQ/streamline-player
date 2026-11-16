<script lang="ts">
import type { Act, Row } from "#lib/core/server-view.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import ChoicePills from "#lib/ui/ChoicePills.svelte";
import Icon, { type IconName } from "#lib/ui/Icon.svelte";

let {
	row,
	onact,
	onpick,
}: {
	row: Extract<Row, { t: "pair" }>;
	onact?: (a: Act) => void;
	onpick?: (code: string, userId: number) => void;
} = $props();

const options = $derived(row.users.map((u): [string, string] => [String(u.id), u.label]));
const chosen = $derived(String(row.users.find((u) => u.on)?.id ?? ""));
</script>

<div class="pair">
	<div class="top">
		<span class="icon"><Icon name={row.icon as IconName} size={18} stroke={1.75} /></span>
		<span class="who">
			<span class="name">{row.device}</span>
			<span class="sub">{row.sub}</span>
		</span>
		<span class="code">{row.code}</span>
	</div>
	<div class="bottom">
		<div class="to">
			<span class="to-label">{i18n.server_pair_to()}</span>
			<ChoicePills
				{options}
				value={chosen}
				label={i18n.server_pair_group()}
				compact
				onchange={(v) => onpick?.(row.code, Number(v))}
			/>
		</div>
		<span class="btns">
			<button type="button" class="deny" onclick={() => onact?.({ do: "deny", code: row.code })}>
				{i18n.approve_deny()}
			</button>
			<button
				type="button"
				class="approve"
				onclick={() => onact?.({ do: "approve", code: row.code })}
			>
				{i18n.approve_approve()}
			</button>
		</span>
	</div>
</div>

<style>
.pair {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.top {
	display: flex;
	align-items: center;
	gap: 12px 14px;
}

.bottom {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px 14px;
	flex-wrap: wrap;
	padding-left: 52px;
}

.to {
	flex: 0 1 auto;
	min-width: 0;
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
}

.to-label {
	font-size: 12.5px;
	color: var(--fg-subtle);
}

.icon {
	flex: none;
	width: 38px;
	height: 38px;
	border-radius: var(--radius-md);
	display: grid;
	place-items: center;
	background: color-mix(in srgb, var(--accent) 12%, transparent);
	border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
	color: var(--accent-text);
}

.who {
	flex: 1 1 auto;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.name {
	font-size: 14px;
	font-weight: 600;
}

.sub {
	font-size: 12.5px;
	line-height: 1.45;
	color: var(--fg-subtle);
}

.code {
	flex: none;
	padding: 6px 10px;
	border-radius: 9px;
	background: var(--bg-deep);
	border: 1px solid var(--border-strong);
	font: 500 17px var(--font-mono);
	letter-spacing: 0.16em;
	color: var(--fg);
}

.btns {
	flex: none;
	display: flex;
	gap: 6px;
}

button {
	height: 36px;
	border-radius: var(--radius-md);
	font: inherit;
	font-size: 13px;
	cursor: pointer;
}

.deny {
	padding: 0 13px;
	border: 1px solid var(--border-strong);
	background: transparent;
	color: var(--fg);
	font-weight: 500;
}

.deny:hover {
	background: var(--surface-2);
}

.approve {
	padding: 0 14px;
	border: 0;
	background: var(--accent);
	color: var(--fg-on-accent);
	font-weight: 600;
}

.approve:hover {
	background: var(--accent-hover);
}
</style>
