<script lang="ts">
import { account } from "#lib/core/me.svelte.ts";
import { FORM_FACTOR } from "#lib/platform/target.ts";
import Server from "#lib/screens/Server.svelte";
import { goto } from "#lib/ui/nav.ts";

const tv = FORM_FACTOR === "tv";
const role = $derived(account.me?.role);

$effect(() => {
	if (tv) goto("/", { replace: true });
	else if (role !== undefined && role !== "Admin") goto("/settings", { replace: true });
});
</script>

{#if !tv && role === "Admin"}
	<Server />
{/if}
