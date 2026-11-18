import { isPhoneSize } from "#lib/platform/form-factor.ts";
import { FORM_FACTOR, TARGET } from "#lib/platform/target.ts";

export { isPhoneSize };

const MOBILE_WEB_TARGETS = ["web", "ios"];

const viewport = $state({ width: window.innerWidth, height: window.innerHeight });

window.addEventListener("resize", () => {
	viewport.width = window.innerWidth;
	viewport.height = window.innerHeight;
});

export const isPhone = () =>
	FORM_FACTOR === "desktop" &&
	MOBILE_WEB_TARGETS.includes(TARGET) &&
	isPhoneSize(viewport.width, viewport.height);
