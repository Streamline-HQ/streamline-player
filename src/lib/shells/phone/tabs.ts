import type { IconName } from "#lib/ui/Icon.svelte";

export type PhoneTab = "home" | "library" | "search" | "downloads";

export const TAB_PATHS: Record<PhoneTab, string> = {
	home: "/",
	library: "/library/movies",
	search: "/search",
	downloads: "/downloads",
};

export const TAB_ICONS: Record<PhoneTab, IconName> = {
	home: "house",
	library: "layout-grid",
	search: "search",
	downloads: "download",
};

const HOME_ROUTES = ["/", "/settings", "/admin", "/activity"];

export const currentTab = (route: string): PhoneTab | null => {
	if (HOME_ROUTES.includes(route)) return "home";
	if (route === "/library/[kind]") return "library";
	if (route === "/search") return "search";
	if (route === "/downloads") return "downloads";
	return null;
};

export const hidesTabs = (route: string) =>
	route === "/welcome" ||
	route === "/pair" ||
	route.startsWith("/signin") ||
	route.startsWith("/player");
