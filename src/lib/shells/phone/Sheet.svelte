<script lang="ts">
import Icon from "#lib/ui/Icon.svelte";
import type { Snippet } from "svelte";

let {
	title,
	closeLabel,
	shown,
	onclose,
	children,
	footer,
}: {
	title?: string;
	closeLabel: string;
	shown: boolean;
	onclose: () => void;
	children: Snippet;
	footer?: Snippet;
} = $props();
</script>

<div class="layer" class:shown>
	<button
		type="button"
		class="scrim"
		tabindex="-1"
		aria-label={closeLabel}
		onclick={onclose}
	></button>
	<div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
		<span class="grip"></span>
		{#if title}
			<div class="head">
				<h2>{title}</h2>
				<button type="button" class="x" aria-label={closeLabel} onclick={onclose}>
					<Icon name="x" size={18} stroke={2} />
				</button>
			</div>
		{/if}
		<div class="body" class:bare={!title}>{@render children()}</div>
		{#if footer}
			<div class="foot">{@render footer()}</div>
		{/if}
	</div>
</div>

<style>
.layer {
	position: absolute;
	inset: 0;
	z-index: 80;
	pointer-events: none;
}

.layer.shown {
	pointer-events: auto;
}

.scrim {
	position: absolute;
	inset: 0;
	border: 0;
	padding: 0;
	background: rgba(0, 0, 0, 0.55);
	opacity: 0;
	transition: opacity 160ms var(--ease-in);
}

.shown .scrim {
	opacity: 1;
	transition: opacity var(--dur-base) var(--ease);
}

.sheet {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	max-height: 100%;
	display: flex;
	flex-direction: column;
	padding-bottom: env(safe-area-inset-bottom);
	border-top: 1px solid var(--border-strong);
	border-radius: var(--radius-lg) var(--radius-lg) 0 0;
	background: var(--bg-elevated);
	box-shadow: var(--shadow-4);
	color: var(--fg);
	transform: translateY(100%);
	transition: transform 210ms var(--ease-in);
}

.shown .sheet {
	transform: none;
	transition: transform var(--dur-slow) var(--ease);
}

.grip {
	position: absolute;
	left: 50%;
	top: 8px;
	width: 36px;
	height: 4px;
	transform: translateX(-50%);
	border-radius: var(--radius-full);
	background: var(--border-strong);
}

.head {
	flex: none;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 20px 8px;
}

h2 {
	margin: 0;
	font-size: 17px;
	font-weight: 600;
	letter-spacing: -0.01em;
}

.x {
	display: grid;
	place-items: center;
	width: 44px;
	height: 44px;
	border: 0;
	border-radius: 50%;
	background: var(--surface);
	color: var(--fg-subtle);
	cursor: pointer;
}

.body {
	min-height: 0;
	overflow-y: auto;
	padding: 0 20px 8px;
	font-size: 14px;
	line-height: 1.5;
	color: var(--fg-muted);
}

.body.bare {
	padding: 22px 20px 12px;
}

.foot {
	flex: none;
	display: flex;
	gap: 10px;
	padding: 14px 20px;
	border-top: 1px solid var(--border);
}

.foot :global(.sl-btn) {
	flex: 1;
	height: 44px;
	border-radius: 12px;
}

.body :global(textarea),
.body :global(input:not([type="checkbox"])) {
	font-size: 16px;
}

.body.bare :global(.sl-dlpop) {
	width: 100%;
	padding: 0;
	border: 0;
	background: transparent;
	box-shadow: none;
}

.body :global(label.row) {
	min-height: 48px;
}

.body :global(.filters button) {
	height: 36px;
}
</style>
