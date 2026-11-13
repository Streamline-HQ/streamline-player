<script lang="ts">
import type { AskSpec } from "#lib/core/ask.svelte.ts";
import { MESSAGE_MAX } from "#lib/core/ask.svelte.ts";
import Button from "#lib/ui/Button.svelte";
import Chip from "#lib/ui/Chip.svelte";
import Dialog from "#lib/ui/Dialog.svelte";
import "#lib/ui/ui.css";

let {
	spec,
	shown,
	cancelLabel,
	closeLabel,
	optionalLabel,
	onclose,
	onconfirm,
}: {
	spec: AskSpec;
	shown: boolean;
	cancelLabel: string;
	closeLabel: string;
	optionalLabel: string;
	onclose: () => void;
	onconfirm: (message: string) => void;
} = $props();

let message = $state("");
</script>

<Dialog title={spec.title} {closeLabel} {shown} {onclose}>
	<p class="body">{spec.body}</p>
	{#if spec.input}
		<div class="input">
			<span class="head">
				<span class="label">{spec.input.label}</span>
				<span class="optional">{optionalLabel}</span>
			</span>
			<textarea
				class="sl-input"
				rows="3"
				maxlength={MESSAGE_MAX}
				placeholder={spec.input.placeholder}
				aria-label={spec.input.label}
				bind:value={message}
			></textarea>
			<div class="presets">
				{#each spec.input.presets as preset (preset)}
					<Chip
						pressed={message === preset}
						tick={false}
						onclick={() => (message = message === preset ? "" : preset)}
					>
						{preset}
					</Chip>
				{/each}
			</div>
		</div>
	{/if}
	{#snippet footer()}
		<Button variant="secondary" onclick={onclose}>{cancelLabel}</Button>
		<Button variant="danger" onclick={() => onconfirm(message)}>{spec.confirm}</Button>
	{/snippet}
</Dialog>

<style>
.body {
	margin: 0;
	text-wrap: pretty;
}

.input {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-top: 16px;
}

.head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 8px;
}

.label {
	font-size: 14px;
	font-weight: 500;
	color: var(--fg);
}

.optional {
	font: var(--type-data-sm);
	color: var(--fg-faint);
}

textarea {
	display: block;
	height: auto;
	padding: 10px 12px;
	resize: none;
	line-height: 1.45;
}

.presets {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
</style>
