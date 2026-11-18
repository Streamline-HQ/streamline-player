<script lang="ts">
import Tip from "#lib/ui/Tip.svelte";
import Icon, { type IconName } from "#lib/ui/Icon.svelte";
import "#lib/ui/ui.css";
import type { Snippet } from "svelte";

let {
	variant = "primary",
	size = "md",
	icon,
	label,
	title,
	dot = false,
	disabled = false,
	active = false,
	hit,
	onclick,
	children,
}: {
	variant?:
		| "primary"
		| "secondary"
		| "ghost"
		| "icon"
		| "danger"
		| "danger-outline"
		| "destructive";
	size?: "sm" | "md";
	icon?: IconName;
	label?: string;
	title?: string;
	/** A colour (any CSS value) tints the dot. */
	dot?: boolean | string;
	disabled?: boolean;
	active?: boolean;
	/** Square side in px of an icon button, where the default 40 is too small for a finger. */
	hit?: number;
	onclick?: (e: MouseEvent) => void;
	children?: Snippet;
} = $props();
</script>

<button
	type="button"
	class="sl-btn sl-btn--{variant}"
	class:sl-btn--sm={size === "sm"}
	class:on={active}
	aria-label={variant === "icon" ? label : undefined}
	{disabled}
	style:width={variant === "icon" && hit ? `${hit}px` : undefined}
	style:height={variant === "icon" && hit ? `${hit}px` : undefined}
	{onclick}
>
	<Tip text={title} />
	{#if icon}
		<Icon name={icon} />
	{/if}
	{@render children?.()}
	{#if variant === "icon" && dot}
		<span
			class="sl-btn__dot"
			aria-hidden="true"
			style:--c={typeof dot === "string" ? dot : undefined}
		></span>
	{/if}
</button>

<style>
.on {
	background: var(--surface);
	color: var(--fg);
}
</style>
