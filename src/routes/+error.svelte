<script lang="ts">
import { page } from "$app/state";
import { m as i18n } from "#lib/paraglide/messages.js";
import NotFound from "#lib/ui/NotFound.svelte";
import { goto } from "#lib/ui/nav.ts";

const missing = $derived(page.status === 404);
</script>

<NotFound
	icon={missing ? "film" : "triangle-alert"}
	title={missing ? i18n.error_not_found() : i18n.error_failed()}
	label={i18n.detail_back_home()}
	onback={() => goto("/", { replace: true })}
/>
