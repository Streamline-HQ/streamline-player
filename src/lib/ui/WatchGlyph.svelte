<script lang="ts">
import "#lib/ui/card.css";
import Icon from "#lib/ui/Icon.svelte";

let { on, size, stroke }: { on: boolean; size: number; stroke: number } = $props();

let ring!: HTMLSpanElement;
let pressed = false;
let tick = $state(0);
let last: boolean | undefined;

// Only the button pressed plays the ring: a season's toggle flips its episodes' glyphs too.
$effect(() => {
	const button = ring.parentElement;
	const arm = () => {
		pressed = true;
	};
	button?.addEventListener("click", arm, { capture: true });
	return () => button?.removeEventListener("click", arm, { capture: true });
});

$effect(() => {
	if (on === last) return;
	if (last !== undefined && pressed) tick++;
	last = on;
	pressed = false;
});
</script>

<span
	class="wtog"
	data-on={on}
	aria-hidden="true"
	style:width="{size}px"
	style:height="{size}px"
	style:stroke-width={stroke}
>
	<Icon name="eye" class="eye" />
	<Icon name="check-check" class="chk" />
</span>
<span
	bind:this={ring}
	class="wpop"
	aria-hidden="true"
	style:animation={tick
		? `slp-wpop-${on ? "on" : "off"}-${tick % 2} 620ms var(--ease) both`
		: undefined}
></span>
