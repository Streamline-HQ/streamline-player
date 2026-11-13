<script lang="ts">
import { FORM_FACTOR } from "#lib/platform/target.ts";
import Activity from "#lib/screens/Activity.svelte";
import { goto } from "#lib/ui/nav.ts";

const tv = FORM_FACTOR === "tv";
$effect(() => {
	if (tv) goto("/", { replace: true });
});
</script>

{#if !tv}
	<Activity />
{/if}
