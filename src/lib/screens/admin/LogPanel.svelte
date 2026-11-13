<script lang="ts">
import { logFilter, logTime } from "#lib/core/server-view.ts";
import type { LogLevel, LogLine } from "#lib/core/types.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import ChoicePills from "#lib/ui/ChoicePills.svelte";

type Level = "all" | "warn" | "error";

let {
	lines,
	level,
	live,
	onlevel,
	onlive,
}: {
	lines: LogLine[];
	level: Level;
	live: boolean;
	onlevel?: (level: Level) => void;
	onlive?: () => void;
} = $props();

const COLOR: Record<LogLevel, string> = {
	debug: "var(--fg-faint)",
	info: "var(--accent-hover)",
	warn: "var(--status-warning)",
	error: "var(--status-failed)",
};
const shown = $derived(logFilter(lines, level));
const locale = getLocale();
const options: [string, string][] = $derived([
	["all", i18n.library_all()],
	["warn", i18n.server_log_warnings()],
	["error", i18n.server_log_errors()],
]);
</script>

<div class="logs">
	<div class="tools">
		<ChoicePills
			{options}
			value={level}
			label={i18n.server_log_level()}
			compact
			onchange={(v) => onlevel?.(v as Level)}
		/>
		<span class="grow"></span>
		<button
			type="button"
			class="live"
			class:on={live}
			aria-pressed={live}
			onclick={() => onlive?.()}
		>
			<span class="dot"></span>{live ? i18n.server_log_live() : i18n.server_log_paused()}
		</button>
	</div>
	<div class="list">
		{#each shown as l (l.id)}
			<div class="line">
				<span class="time">{logTime(l.at, locale)}</span>
				<span style:color={COLOR[l.level]} class="lv">{l.level}</span>
				<span class="msg"><span class="src">{l.source}</span> {l.message}</span>
			</div>
		{/each}
		{#if shown.length === 0}
			<div class="none">{i18n.server_log_none()}</div>
		{/if}
	</div>
</div>

<style>
.logs {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.tools {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
}

.grow {
	flex: 1;
}

.live {
	height: 30px;
	display: flex;
	align-items: center;
	gap: 7px;
	padding: 0 11px;
	border-radius: var(--radius-full);
	border: 1px solid var(--border-strong);
	background: transparent;
	color: var(--fg-subtle);
	font: 500 11.5px var(--font-mono);
	cursor: pointer;
}

.live.on {
	border-color: color-mix(in srgb, var(--status-available) 30%, transparent);
	background: color-mix(in srgb, var(--status-available) 10%, transparent);
	color: var(--status-available);
}

.dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: currentColor;
}

.list {
	max-height: 340px;
	overflow-y: auto;
	border-radius: var(--radius-md);
	background: var(--bg-deep);
	border: 1px solid var(--border);
	padding: 8px 0;
	font: 400 11.5px / 1.65 var(--font-mono);
}

.line {
	display: grid;
	grid-template-columns: 62px 44px minmax(0, 1fr);
	gap: 10px;
	padding: 1px 14px;
}

.time {
	color: var(--fg-faint);
	font-variant-numeric: tabular-nums;
}

.lv {
	text-transform: uppercase;
}

.msg {
	min-width: 0;
	overflow-wrap: anywhere;
	color: var(--fg-muted);
}

.src {
	color: var(--fg-subtle);
}

.none {
	padding: 10px 14px;
	color: var(--fg-faint);
}
</style>
