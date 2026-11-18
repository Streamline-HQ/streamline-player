<script lang="ts">
import { isPhone } from "#lib/platform/form-factor.svelte.ts";
import { FORM_FACTOR } from "#lib/platform/target.ts";
import PhoneSearch from "#lib/screens/phone/Search.svelte";
import Search from "#lib/screens/Search.svelte";
import TvSearch from "#lib/screens/tv/Search.svelte";
</script>

{#if FORM_FACTOR === "tv"}
	<TvSearch />
{:else if isPhone()}
	<PhoneSearch />
{:else}
	<Search />
{/if}
