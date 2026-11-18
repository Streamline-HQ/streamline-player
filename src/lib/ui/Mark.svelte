<script lang="ts">
import { staticUrl } from "#lib/ui/nav.ts";
let {
	size = 36,
	src = staticUrl("streamline-mark.png"),
	radius: given,
	ring = true,
}: { size?: number; src?: string; radius?: number; ring?: boolean } = $props();
const radius = $derived(
	given !== undefined
		? `${given}px`
		: size >= 48
			? "12px"
			: size >= 36
				? "var(--radius-md)"
				: "8px",
);
</script>

<img {src} alt="" width={size} height={size} style:border-radius={radius} class:ring>

<style>
img {
	display: block;
	flex: none;
}

.ring {
	box-shadow: 0 0 0 1px var(--border);
}
</style>
