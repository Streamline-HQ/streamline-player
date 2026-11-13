import { type AdminData, commitNumber, commitText } from "#lib/core/server-view.ts";
import type {
	AdminDevice,
	AdminLibrary,
	AdminOverview,
	AdminPairing,
	AdminSettings,
	AdminStream,
	LogLine,
	SettingOwner,
	SettingValue,
} from "#lib/core/types.ts";

export type AdminPort = {
	adminOverview(): Promise<AdminOverview>;
	adminSettings(): Promise<AdminSettings>;
	saveAdminSettings(patch: Record<string, SettingValue>): Promise<AdminSettings>;
	adminRestart(message?: string): Promise<unknown>;
	adminStreams(): Promise<AdminStream[]>;
	stopStream(id: string, message?: string): Promise<unknown>;
	adminPairings(): Promise<AdminPairing[]>;
	adminDevices(): Promise<AdminDevice[]>;
	adminRevokeDevice(id: string): Promise<unknown>;
	adminLibrary(): Promise<AdminLibrary>;
	adminScan(folderId?: string): Promise<unknown>;
	adminClearCache(): Promise<unknown>;
	adminLogs(level: LogLevelFilter, after?: number): Promise<LogLine[]>;
	adminLogsDownload(): Promise<string>;
};

export type LogLevelFilter = "all" | "warn" | "error";
export type SaveResult = "ok" | "failed" | "invalid" | "read_only";

export type Timers = { sleep(ms: number): Promise<void>; now(): number };
const realTimers: Timers = {
	sleep: (ms) => new Promise((done) => setTimeout(() => done(), ms)),
	now: () => Date.now(),
};

const LOG_LINES = 80;
const RESTART_POLL_MS = 2000;
const RESTART_LATE_MS = 60_000;

export const admin: {
	data: AdminData | null;
	logs: LogLine[];
	level: LogLevelFilter;
	live: boolean;
	loaded: boolean;
	error: string | null;
	forbidden: boolean;
	restarting: boolean;
	lateRestart: boolean;
	drafts: Record<string, string>;
} = $state({
	data: null,
	logs: [],
	level: "all",
	live: true,
	loaded: false,
	error: null,
	forbidden: false,
	restarting: false,
	lateRestart: false,
	drafts: {},
});

export const pendingPairs: { n: number } = $state({ n: 0 });

let inflight: Promise<void> | null = null;
let generation = 0;
const saving = new Map<string, SettingValue>();
let saveEpoch = 0;

/** Servers answer `{ error: { code } }`; the platform layer throws that body as text. */
function errorOf(e: unknown): { code?: string; owner?: string } {
	const text = e instanceof Error ? e.message : String(e);
	try {
		const body = JSON.parse(text)?.error;
		return typeof body === "object" && body ? body : {};
	} catch {
		return {};
	}
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** What a poll brings must not undo a save that is still on its way. */
function withSaving(s: AdminSettings): AdminSettings {
	if (!saving.size) return s;
	return { ...s, values: { ...s.values, ...Object.fromEntries(saving) } };
}

function load(port: AdminPort, reset: boolean) {
	if (inflight) return inflight;
	const run = generation;
	const epoch = saveEpoch;
	inflight = Promise.all([
		port.adminOverview(),
		port.adminSettings(),
		port.adminStreams(),
		port.adminPairings(),
		port.adminDevices(),
		port.adminLibrary(),
		port.adminLogs(admin.level),
	])
		.then(
			([overview, settings, streams, pairings, devices, library, logs]) => {
				if (run !== generation) return;
				admin.data = {
					overview,
					settings: epoch === saveEpoch ? withSaving(settings) : (admin.data?.settings ?? settings),
					streams,
					pairings,
					devices,
					library,
					cacheCleared: !!admin.data?.cacheCleared && overview.storage.cache.size === 0,
					web: devices.find((d) => d.current)?.kind === "browser",
					tick: 0,
				};
				admin.logs = logs.slice(0, LOG_LINES);
				admin.loaded = true;
				admin.error = null;
				admin.forbidden = false;
				pendingPairs.n = pairings.length;
				if (reset) admin.drafts = {};
			},
			(e) => {
				if (run !== generation) return;
				if (errorOf(e).code === "forbidden") {
					admin.forbidden = true;
					admin.data = null;
					pendingPairs.n = 0;
				} else admin.error = messageOf(e);
			},
		)
		.finally(() => {
			if (run === generation) inflight = null;
		});
	return inflight;
}

export const loadAdmin = (port: AdminPort) => load(port, true);
export const refreshAdmin = (port: AdminPort) => load(port, false);

export function tickStreams() {
	if (admin.data) admin.data.tick++;
}

export async function loadPendingPairs(port: Pick<AdminPort, "adminPairings">) {
	try {
		pendingPairs.n = (await port.adminPairings()).length;
	} catch (e) {
		if (errorOf(e).code === "forbidden") pendingPairs.n = 0;
	}
}

export async function refreshLogs(port: AdminPort) {
	if (!admin.live) return;
	const level = admin.level;
	const newest = admin.logs[0]?.id;
	try {
		const fresh = await port.adminLogs(level, newest);
		if (level !== admin.level || newest !== admin.logs[0]?.id) return;
		admin.logs = [...fresh, ...admin.logs].slice(0, LOG_LINES);
	} catch {}
}

export async function setLevel(port: AdminPort, level: LogLevelFilter) {
	admin.level = level;
	admin.logs = [];
	try {
		const lines = await port.adminLogs(level);
		if (level === admin.level) admin.logs = lines.slice(0, LOG_LINES);
	} catch {}
}

export async function save(port: AdminPort, key: string, value: SettingValue): Promise<SaveResult> {
	const settings = admin.data?.settings;
	if (!settings) return "failed";
	const owner: SettingOwner = settings.owners[key] ?? "streamline";
	if (settings.read_only[owner]) return "read_only";
	const before = settings.values[key];
	if (before === value) return "ok";
	settings.values[key] = value;
	saving.set(key, value);
	saveEpoch++;
	try {
		const saved = await port.saveAdminSettings({ [key]: value });
		saving.delete(key);
		saveEpoch++;
		if (admin.data) admin.data.settings = withSaving(saved);
		return "ok";
	} catch (e) {
		saving.delete(key);
		saveEpoch++;
		const now = admin.data?.settings;
		if (now && now.values[key] === value && before !== undefined) now.values[key] = before;
		const { code, owner: lockedOwner } = errorOf(e);
		if (code === "read_only") {
			if (now) now.read_only[(lockedOwner as SettingOwner | undefined) ?? owner] = true;
			return "read_only";
		}
		return code === "invalid_setting" ? "invalid" : "failed";
	}
}

export function draft(key: string, raw: string) {
	admin.drafts[key] = raw;
}

type Editable = {
	t: "toggle" | "choice" | "text" | "num";
	key: string;
	min?: number;
	max?: number;
	allowEmpty?: boolean;
};

export async function commit(port: AdminPort, row: Editable): Promise<SaveResult> {
	const raw = admin.drafts[row.key];
	if (raw === undefined) return "ok";
	delete admin.drafts[row.key];
	if (row.t === "num") {
		const n = commitNumber(
			raw,
			row.min ?? Number.MIN_SAFE_INTEGER,
			row.max ?? Number.MAX_SAFE_INTEGER,
		);
		return n === null ? "invalid" : save(port, row.key, n);
	}
	const text = commitText(raw, row.allowEmpty ?? false);
	return text === null ? "invalid" : save(port, row.key, text);
}

export async function stop(port: AdminPort, id: string, message?: string) {
	const d = admin.data;
	const at = d?.streams.findIndex((s) => s.id === id) ?? -1;
	if (!d || at < 0) return false;
	const [gone] = d.streams.splice(at, 1);
	try {
		await port.stopStream(id, message);
		return true;
	} catch {
		admin.data?.streams.splice(Math.min(at, admin.data.streams.length), 0, gone!);
		return false;
	}
}

export async function revoke(port: AdminPort, id: string) {
	const d = admin.data;
	const at = d?.devices.findIndex((x) => x.id === id) ?? -1;
	if (!d || at < 0) return false;
	const [gone] = d.devices.splice(at, 1);
	try {
		await port.adminRevokeDevice(id);
		return true;
	} catch {
		admin.data?.devices.splice(Math.min(at, admin.data.devices.length), 0, gone!);
		return false;
	}
}

export async function scan(port: AdminPort, folder?: string) {
	if (!admin.data) return false;
	const folders = admin.data.library.folders.filter(
		(f) => (folder === undefined || f.id === folder) && !f.scan,
	);
	if (!folders.length) return true;
	for (const f of folders) f.scan = { progress: 0, eta_seconds: 0 };
	try {
		await port.adminScan(folder);
		return true;
	} catch {
		for (const f of folders) delete f.scan;
		return false;
	}
}

export async function clearCache(port: AdminPort) {
	const d = admin.data;
	if (!d) return false;
	const size = d.overview.storage.cache.size;
	d.cacheCleared = true;
	d.overview.storage.cache.size = 0;
	try {
		await port.adminClearCache();
		return true;
	} catch {
		if (admin.data) {
			admin.data.cacheCleared = false;
			admin.data.overview.storage.cache.size = size;
		}
		return false;
	}
}

export async function restart(port: AdminPort, message?: string, timers: Timers = realTimers) {
	if (admin.restarting || !admin.data) return;
	const before = Date.parse(admin.data.overview.server.started_at);
	admin.restarting = true;
	admin.lateRestart = false;
	const run = generation;
	try {
		await port.adminRestart(message);
	} catch (e) {
		admin.restarting = false;
		throw e;
	}
	void (async () => {
		const began = timers.now();
		while (run === generation && admin.restarting) {
			await timers.sleep(RESTART_POLL_MS);
			if (run !== generation || !admin.restarting) return;
			try {
				const overview = await port.adminOverview();
				if (Date.parse(overview.server.started_at) > before) {
					admin.restarting = false;
					admin.lateRestart = false;
					await refreshAdmin(port);
					return;
				}
			} catch {}
			if (timers.now() - began >= RESTART_LATE_MS) admin.lateRestart = true;
		}
	})();
}

export function resetAdmin() {
	generation++;
	inflight = null;
	saving.clear();
	saveEpoch++;
	admin.data = null;
	admin.logs = [];
	admin.level = "all";
	admin.live = true;
	admin.loaded = false;
	admin.error = null;
	admin.forbidden = false;
	admin.restarting = false;
	admin.lateRestart = false;
	admin.drafts = {};
	pendingPairs.n = 0;
}
