<script lang="ts">
import type { Kind } from "#lib/core/types.ts";
import { isPhone } from "#lib/platform/form-factor.svelte.ts";
import { FORM_FACTOR } from "#lib/platform/target.ts";
import Player from "#lib/screens/Player.svelte";
import PhonePlayer from "#lib/screens/phone/Player.svelte";
import TvPlayer from "#lib/screens/tv/Player.svelte";
import { page } from "$app/state";

const props = $derived({
	kind: page.params.kind as Kind,
	id: Number(page.params.id),
	epId: Number(page.url.searchParams.get("ep")) || null,
	resume: page.url.searchParams.has("resume"),
	local: page.url.searchParams.has("local")
		? {
				season: Number(page.url.searchParams.get("s")) || null,
				episode: Number(page.url.searchParams.get("e")) || null,
			}
		: null,
});
</script>

{#if FORM_FACTOR === "tv"}
	<TvPlayer {...props} />
{:else if isPhone()}
	<PhonePlayer {...props} />
{:else}
	<Player {...props} />
{/if}
