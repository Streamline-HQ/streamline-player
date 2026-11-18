import { type ChoiceKey, myLanguage } from "#lib/core/prefs.svelte.ts";
import { m as i18n } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";

// Stored values stay English (the player's rules read them); only what is shown is translated.
const VALUES: Record<string, () => string> = {
	Auto: i18n.value_auto,
	"App language": i18n.value_app_language,
	Original: i18n.value_original,
	"Original language": i18n.value_original_language,
	English: i18n.value_english,
	French: i18n.value_french,
	Always: i18n.value_always,
	None: i18n.value_none,
	Shadow: i18n.value_shadow,
	Box: i18n.value_box,
	White: i18n.value_white,
	Yellow: i18n.value_yellow,
	"On start": i18n.value_on_start,
	"Pass through": i18n.value_pass_through,
	"Decode here": i18n.value_decode_here,
	"No limit": i18n.value_no_limit,
};

/** The subtitle language as a sentence names it: "French" in English, "français" in French. */
export const subtitleLanguageName = () =>
	new Intl.DisplayNames([getLocale()], { type: "language" }).of(
		myLanguage() === "French" ? "fr" : "en",
	) ?? myLanguage();

export const languageName = (tag?: string) =>
	tag ? (new Intl.DisplayNames([getLocale()], { type: "language" }).of(tag) ?? tag) : "";

export const shown = (key: ChoiceKey, v: string) => {
	// Each app language is named in itself, so it can be found from any other.
	if (key === "language") return v;
	if (v === "Off") return key === "subsMode" ? i18n.value_off() : i18n.value_frame_off();
	return VALUES[v]?.() ?? v;
};

export const QUALITIES = [
	"Auto",
	"Original",
	"20 Mbit/s",
	"8 Mbit/s",
	"4 Mbit/s",
	"2 Mbit/s",
	"1 Mbit/s",
];
