<script lang="ts">
import { isPhone } from "#lib/platform/form-factor.svelte.ts";
import { FORM_FACTOR } from "#lib/platform/target.ts";
import Home from "#lib/screens/Home.svelte";
import PhoneHome from "#lib/screens/phone/Home.svelte";
import TvHome from "#lib/screens/tv/Home.svelte";
</script>

{#if FORM_FACTOR === "tv"}
	<TvHome />
{:else if isPhone()}
	<PhoneHome />
{:else}
	<Home />
{/if}
