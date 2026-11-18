import { m as i18n } from "#lib/paraglide/messages.js";

/** What a failed load reads as. The server's own refusals arrive as its JSON envelope; anything else never reached it. */
export const loadErrorText = (raw: string) =>
	raw.trimStart().startsWith("{") ? i18n.home_error_server() : i18n.home_error_network();
