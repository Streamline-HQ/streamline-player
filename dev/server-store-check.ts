// node --import ./dev/controller-check/register.mjs dev/server-store-check.ts
import { strictEqual as eq, deepStrictEqual as same } from "node:assert";
import type { AdminSettings, LogLine } from "../src/lib/core/types.ts";

const S = await import("../src/lib/core/admin.svelte.ts");
const { admin, pendingPairs } = S;

const flush = async () => {
	for (let i = 0; i < 8; i++) await new Promise((done) => setImmediate(done));
};

function clock() {
	let now = 0;
	const waiting: { at: number; done: () => void }[] = [];
	return {
		timers: {
			now: () => now,
			sleep: (ms: number) => new Promise<void>((done) => waiting.push({ at: now + ms, done })),
		},
		async advance(ms: number) {
			const end = now + ms;
			for (;;) {
				waiting.sort((a, b) => a.at - b.at);
				const due = waiting[0];
				if (!due || due.at > end) break;
				waiting.shift();
				now = due.at;
				due.done();
				await flush();
			}
			now = end;
		},
	};
}

const failure = (code: string, extra: object = {}) =>
	new Error(JSON.stringify({ error: { code, ...extra } }));

const line = (id: number, level: LogLine["level"] = "info"): LogLine => ({
	id,
	at: "2026-11-09T10:00:00Z",
	level,
	source: "x",
	message: `m${id}`,
});

function port() {
	const settings = (): AdminSettings => ({
		values: { "stream.max_live": 2, "log.app.level": "info", "otel.endpoint": "" },
		owners: {
			"stream.max_live": "engine",
			"log.app.level": "streamline",
			"otel.endpoint": "streamline",
		},
		read_only: { streamline: false, engine: false },
		pending: [],
		restart_keys: ["log.app.level"],
	});
	const p = {
		calls: [] as [string, ...unknown[]][],
		count: (name: string) => p.calls.filter((c) => c[0] === name).length,
		fail: {} as Record<string, Error | undefined>,
		startedAt: "2026-11-08T05:00:00+00:00",
		cache: 3200000000,
		logs: [line(3), line(2), line(1)],
		gate: null as Promise<void> | null,
		async hit(name: string, ...args: unknown[]) {
			p.calls.push([name, ...args]);
			if (p.gate) await p.gate;
			const err = p.fail[name];
			if (err) throw err;
		},
		async adminOverview() {
			await p.hit("adminOverview");
			return {
				server: { started_at: p.startedAt, version: "2.4.1" },
				storage: { cache: { path: "/c", size: p.cache, streams: 3 } },
			} as never;
		},
		async adminSettings() {
			await p.hit("adminSettings");
			return settings();
		},
		async saveAdminSettings(patch: Record<string, unknown>) {
			await p.hit("saveAdminSettings", patch);
			const s = settings();
			Object.assign(s.values, patch);
			s.pending = Object.keys(patch);
			return s;
		},
		async adminRestart(message?: string) {
			await p.hit("adminRestart", message);
		},
		async adminStreams() {
			await p.hit("adminStreams");
			return [{ id: "s1" }, { id: "s2" }] as never;
		},
		async stopStream(id: string, message?: string) {
			await p.hit("stopStream", id, message);
		},
		async adminPairings() {
			await p.hit("adminPairings");
			return [{ user_code: "R4W-X9P" }] as never;
		},
		async adminDevices() {
			await p.hit("adminDevices");
			return [
				{ id: "me", kind: "app", current: true },
				{ id: "d5", kind: "app", current: false },
			] as never;
		},
		async adminRevokeDevice(id: string) {
			await p.hit("adminRevokeDevice", id);
		},
		async adminLibrary() {
			await p.hit("adminLibrary");
			return {
				folders: [
					{ id: "movies", name: "Movies" },
					{ id: "series", name: "Series" },
				],
			} as never;
		},
		async adminScan(folder?: string) {
			await p.hit("adminScan", folder);
		},
		async adminClearCache() {
			await p.hit("adminClearCache");
			p.cache = 0;
		},
		async adminLogs(level: string, after?: number) {
			await p.hit("adminLogs", level, after);
			return p.logs.filter((l) => after === undefined || l.id > after);
		},
		async adminLogsDownload() {
			return "streamline-logs.zip";
		},
	};
	return p;
}
const LISTS = [
	"adminOverview",
	"adminSettings",
	"adminStreams",
	"adminPairings",
	"adminDevices",
	"adminLibrary",
	"adminLogs",
];

let p = port();
await Promise.all([S.loadAdmin(p), S.loadAdmin(p), S.refreshAdmin(p)]);
for (const list of LISTS) eq(p.count(list), 1, list);
eq(admin.loaded, true);
eq(admin.data?.streams.length, 2);
eq(admin.data?.web, false);
eq(pendingPairs.n, 1);
eq(admin.logs.length, 3);

p.fail.adminStreams = new Error("down");
await S.loadAdmin(p);
eq(typeof admin.error, "string");
eq(admin.data?.streams.length, 2);
p.fail.adminStreams = failure("forbidden");
await S.loadAdmin(p);
eq(admin.forbidden, true);
eq(admin.data, null);
eq(pendingPairs.n, 0);
S.resetAdmin();
p = port();
p.fail.adminOverview = failure("forbidden");
await S.loadAdmin(p);
eq(admin.forbidden, true);
eq(admin.data, null);
eq(admin.loaded, false);

S.resetAdmin();
p = port();
await S.loadAdmin(p);

let gate!: () => void;
p.gate = new Promise<void>((done) => {
	gate = done;
});
const saved = S.save(p, "stream.max_live", 3);
eq(admin.data?.settings.values["stream.max_live"], 3);
await flush();
same(p.calls.at(-1), ["saveAdminSettings", { "stream.max_live": 3 }]);
const polling = S.refreshAdmin(p);
gate();
p.gate = null;
await polling;
eq(admin.data?.settings.values["stream.max_live"], 3);
eq(await saved, "ok");
eq(admin.data?.settings.values["stream.max_live"], 3);
eq(admin.data?.settings.pending.join(), "stream.max_live");

const sends = p.count("saveAdminSettings");
eq(await S.save(p, "stream.max_live", 3), "ok");
eq(p.count("saveAdminSettings"), sends);

S.resetAdmin();
p = port();
await S.loadAdmin(p);
p.fail.saveAdminSettings = new Error("down");
eq(await S.save(p, "stream.max_live", 4), "failed");
eq(admin.data?.settings.values["stream.max_live"], 2);
same(admin.data?.settings.pending, []);
p.fail.saveAdminSettings = undefined;
eq(await S.save(p, "stream.max_live", 4), "ok");
eq(admin.data?.settings.values["stream.max_live"], 4);

S.resetAdmin();
p = port();
await S.loadAdmin(p);
p.fail.saveAdminSettings = failure("read_only", { owner: "engine" });
eq(await S.save(p, "stream.max_live", 5), "read_only");
eq(admin.data?.settings.values["stream.max_live"], 2);
eq(admin.data?.settings.read_only.engine, true);
eq(admin.data?.settings.read_only.streamline, false);
const before = p.count("saveAdminSettings");
eq(await S.save(p, "stream.max_live", 6), "read_only");
eq(p.count("saveAdminSettings"), before);
p.fail.saveAdminSettings = failure("invalid_setting", { key: "log.app.level" });
eq(await S.save(p, "log.app.level", "loud"), "invalid");
eq(admin.data?.settings.values["log.app.level"], "info");

S.resetAdmin();
p = port();
await S.loadAdmin(p);
S.draft("stream.max_live", "7");
await S.refreshAdmin(p);
eq(admin.drafts["stream.max_live"], "7");
S.draft("stream.max_live", "abc");
const num = { t: "num", key: "stream.max_live", min: 1, max: 8 } as const;
eq(await S.commit(p, num), "invalid");
eq(p.count("saveAdminSettings"), 0);
eq(admin.drafts["stream.max_live"], undefined);
S.draft("stream.max_live", "999");
eq(await S.commit(p, num), "ok");
same(p.calls.at(-1), ["saveAdminSettings", { "stream.max_live": 8 }]);
S.draft("otel.endpoint", "  ");
eq(await S.commit(p, { t: "text", key: "otel.endpoint", allowEmpty: true }), "ok");
eq(p.count("saveAdminSettings"), 1);
S.draft("log.app.level", "  ");
eq(await S.commit(p, { t: "text", key: "log.app.level" }), "invalid");
eq(p.count("saveAdminSettings"), 1);

S.resetAdmin();
p = port();
await S.loadAdmin(p);
eq(await S.stop(p, "s1", "bye"), true);
same(
	admin.data?.streams.map((s) => s.id),
	["s2"],
);
same(p.calls.at(-1), ["stopStream", "s1", "bye"]);
p.fail.stopStream = new Error("down");
eq(await S.stop(p, "s2"), false);
same(
	admin.data?.streams.map((s) => s.id),
	["s2"],
);
eq(await S.revoke(p, "d5"), true);
same(
	admin.data?.devices.map((d) => d.id),
	["me"],
);
p.fail.adminRevokeDevice = failure("current_device");
eq(await S.revoke(p, "me"), false);
same(
	admin.data?.devices.map((d) => d.id),
	["me"],
);
p.fail.adminRevokeDevice = undefined;

p.gate = new Promise<void>((done) => {
	gate = done;
});
const scanning = S.scan(p, "movies");
const folders = admin.data!.library.folders;
eq(folders[0]!.scan?.progress, 0);
eq(folders[1]!.scan, undefined);
gate();
p.gate = null;
eq(await scanning, true);
p.fail.adminScan = new Error("down");
eq(await S.scan(p), false);
eq(folders[1]!.scan, undefined);
eq(folders[0]!.scan?.progress, 0);

p.gate = new Promise<void>((done) => {
	gate = done;
});
const clearing = S.clearCache(p);
eq(admin.data?.cacheCleared, true);
eq(admin.data?.overview.storage.cache.size, 0);
gate();
p.gate = null;
eq(await clearing, true);
p.fail.adminClearCache = new Error("down");
admin.data!.cacheCleared = false;
admin.data!.overview.storage.cache.size = 3200000000;
eq(await S.clearCache(p), false);
eq(admin.data?.cacheCleared, false);
eq(admin.data?.overview.storage.cache.size, 3200000000);

S.resetAdmin();
p = port();
await S.loadAdmin(p);
let c = clock();
await S.restart(p, "Back in a minute", c.timers);
eq(p.count("adminRestart"), 1);
same(p.calls.filter((x) => x[0] === "adminRestart")[0], ["adminRestart", "Back in a minute"]);
eq(admin.restarting, true);
await S.restart(p, "again", c.timers);
eq(p.count("adminRestart"), 1);
const polls = p.count("adminOverview");
await c.advance(1900);
eq(p.count("adminOverview"), polls);
await c.advance(200);
eq(p.count("adminOverview"), polls + 1);
eq(admin.restarting, true);
p.startedAt = "2026-11-09T12:00:10+00:00";
await c.advance(2000);
eq(admin.restarting, false);
eq(admin.lateRestart, false);
eq(admin.data?.overview.server.started_at, p.startedAt);

S.resetAdmin();
p = port();
await S.loadAdmin(p);
c = clock();
await S.restart(p, undefined, c.timers);
await c.advance(58_000);
eq(admin.lateRestart, false);
await c.advance(4000);
eq(admin.lateRestart, true);
eq(admin.restarting, true);
const lateCalls = p.count("adminOverview");
await c.advance(10_000);
ok(p.count("adminOverview") > lateCalls);
p.startedAt = "2026-11-09T12:05:00+00:00";
await c.advance(2000);
eq(admin.restarting, false);
eq(admin.lateRestart, false);

S.resetAdmin();
p = port();
await S.loadAdmin(p);
p.fail.adminRestart = new Error("down");
await S.restart(p, undefined, clock().timers).then(
	() => eq(0, 1),
	() => {},
);
eq(admin.restarting, false);

S.resetAdmin();
p = port();
await S.loadAdmin(p);
p.logs = [line(5, "warn"), line(4), ...p.logs];
await S.refreshLogs(p);
same(p.calls.at(-1), ["adminLogs", "all", 3]);
same(
	admin.logs.map((l) => l.id),
	[5, 4, 3, 2, 1],
);
p.logs = Array.from({ length: 100 }, (_, i) => line(200 - i));
await S.refreshLogs(p);
eq(admin.logs.length, 80);
eq(admin.logs[0]!.id, 200);
admin.live = false;
const asked = p.count("adminLogs");
await S.refreshLogs(p);
eq(p.count("adminLogs"), asked);
admin.live = true;
await S.setLevel(p, "error");
eq(admin.level, "error");
same(p.calls.at(-1), ["adminLogs", "error", undefined]);

S.resetAdmin();
eq(admin.data, null);
eq(admin.logs.length, 0);
eq(admin.loaded, false);
eq(pendingPairs.n, 0);
await S.loadPendingPairs(p);
eq(pendingPairs.n, 1);
p.fail.adminPairings = failure("forbidden");
await S.loadPendingPairs(p);
eq(pendingPairs.n, 0);

function ok(v: unknown) {
	eq(!!v, true);
}
console.log("server-store-check: ok");
