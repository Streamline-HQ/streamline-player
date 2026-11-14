<script lang="ts">
import { FORM_FACTOR } from "#lib/platform/target.ts";
import Downloads from "#lib/screens/Downloads.svelte";
import { goto } from "#lib/ui/nav.ts";
import { canDownload } from "#platform";

const here = FORM_FACTOR !== "tv" && canDownload;
$effect(() => {
	if (!here) goto("/", { replace: true });
});
</script>

{#if here}
	<Downloads />
{/if}
