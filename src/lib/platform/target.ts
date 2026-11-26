import { isTvAgent } from "#lib/platform/form-factor.ts";

export type Target = "web" | "linux" | "windows" | "darwin" | "android" | "ios";
export type FormFactor = "desktop" | "tv" | "phone" | "tablet";

export const TARGET: Target = (import.meta.env.TAURI_ENV_PLATFORM as Target | undefined) || "web";
export const IS_WEB = TARGET === "web";
// ponytail: a touch screen means phone or tablet; a TV with a touch panel would get the wrong
// shell. Ask the plugin for FEATURE_LEANBACK if that ever shows up.
const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

// A TV whose agent we don't know can be switched by hand; dev builds also take `?form=tv`.
const askedForTv = () => {
	try {
		const query = import.meta.env.DEV ? new URLSearchParams(location.search).get("form") : null;
		return (query ?? localStorage.getItem("slp.form")) === "tv";
	} catch {
		return false;
	}
};
const webTv = IS_WEB && (isTvAgent(navigator.userAgent) || askedForTv());

export const FORM_FACTOR: FormFactor = (TARGET === "android" && !touch) || webTv ? "tv" : "desktop";

/** A browser signs in on Streamline's own page; a TV, native or in a browser, pairs with a code. */
export const SIGNS_IN = IS_WEB && FORM_FACTOR !== "tv";
