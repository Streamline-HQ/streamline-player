<script lang="ts">
import { isPhone } from "#lib/platform/form-factor.svelte.ts";
import { FORM_FACTOR } from "#lib/platform/target.ts";
import PhoneSettings from "#lib/screens/phone/Settings.svelte";
import Settings from "#lib/screens/Settings.svelte";
import TvSettings from "#lib/screens/tv/Settings.svelte";
</script>

{#if FORM_FACTOR === "tv"}
	<TvSettings />
{:else if isPhone()}
	<PhoneSettings />
{:else}
	<Settings />
{/if}
