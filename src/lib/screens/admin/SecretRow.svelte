<script lang="ts">
import type { Act, Row } from "#lib/core/server-view.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import Button from "#lib/ui/Button.svelte";
import Icon from "#lib/ui/Icon.svelte";

let { row, onact }: { row: Extract<Row, { t: "secret" }>; onact?: (a: Act) => void } = $props();
</script>

<div class="secret" role="status">
	<span class="title">
		<Icon name="triangle-alert" size={16} stroke={1.9} />{i18n.server_secret_title()}
	</span>
	<code class="value">{row.value}</code>
	<span class="body">
		{i18n.server_secret_body_a()}<code>secret</code>{i18n.server_secret_body_b()}
	</span>
	<span class="btns">
		<Button variant="primary" size="sm" onclick={() => onact?.({ do: "copysecret" })}>
			{i18n.server_btn_copy()}
		</Button>
		<Button variant="secondary" size="sm" onclick={() => onact?.({ do: "donesecret" })}>
			{i18n.server_btn_saved()}
		</Button>
	</span>
</div>

<style>
.secret {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 14px;
	border-radius: var(--radius-md);
	background: color-mix(in srgb, var(--status-warning) 8%, transparent);
	border: 1px solid color-mix(in srgb, var(--status-warning) 32%, transparent);
}

.title {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 14px;
	font-weight: 600;
	color: var(--status-warning);
}

.title :global(.sl-ico) {
	flex: none;
}

.value {
	display: block;
	padding: 10px 12px;
	border-radius: 9px;
	background: var(--bg-deep);
	border: 1px solid var(--border-strong);
	font: 400 12.5px var(--font-mono);
	color: var(--fg);
	word-break: break-all;
	user-select: all;
}

.body {
	font-size: 12.5px;
	line-height: 1.5;
	color: var(--fg-subtle);
	text-wrap: pretty;
}

.body code {
	font-family: var(--font-mono);
}

.btns {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}
</style>
