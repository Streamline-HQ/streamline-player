import type { AdminPort } from "#lib/core/admin.svelte.ts";
import {
	adminClearCache,
	adminDevices,
	adminLibrary,
	adminOverview,
	adminPairings,
	adminRestart,
	adminRevokeDevice,
	adminScan,
	adminSettings,
	adminStreams,
	adminUsers,
	saveAdminSettings,
	stopStream,
} from "#platform";

export const adminPort: AdminPort = {
	adminOverview,
	adminSettings,
	saveAdminSettings,
	adminRestart,
	adminStreams,
	stopStream,
	adminPairings,
	adminDevices,
	adminRevokeDevice,
	adminLibrary,
	adminScan,
	adminClearCache,
	adminUsers,
};
