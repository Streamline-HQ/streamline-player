// node --import ./dev/controller-check/register.mjs dev/server-store-check.ts
import { strictEqual as eq, deepStrictEqual as same } from "node:assert";
import { must } from "./must.ts";
import type { AdminSettings } from "../src/lib/core/types.ts";

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

function port() {
	const settings = (): AdminSettings => ({
		values: {
			"stream.max_live": 2,
			"player.url": "https://player.example",
			"engine.url": "",
			"player.origins": ["https://player.example"],
		},
		owners: {
			"player.origins": "player",
			"stream.max_live": "engine",
			"player.url": "player",
			"engine.url": "player",
		},
		read_only: { engine: false, player: false },
		pending: [],
		restart_keys: ["stream.max_live"],
	});
	const p = {
		calls: [] as [string, ...unknown[]][],
		count: (name: string) => p.calls.filter((c) => c[0] === name).length,
		fail: {} as Record<string, Error | undefined>,
		engineUp: true,
		cache: 3200000000,
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
				extension: { version: "0.1.0" },
				engine: { reachable: p.engineUp },
				storage: { cache: { size: p.cache, streams: 3 } },
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
			return [{ user_code: "R4W-X9P", name: "iPad mini", platform: "iPadOS" }] as never;
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
		async adminUsers() {
			await p.hit("adminUsers");
			return [
				{ id: 1, name: "Antoine", role: "Admin" },
				{ id: 2, name: "Camille", role: "Member" },
			] as never;
		},
		secretSet: true,
		async adminEngineSecret() {
			await p.hit("adminEngineSecret");
			return (
				p.secretSet ? { set: true, created_at: "2026-11-16T09:00:00Z" } : { set: false }
			) as never;
		},
		async adminRotateEngineSecret() {
			await p.hit("adminRotateEngineSecret");
			p.secretSet = true;
			return { secret: "s3cret" };
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
	"adminUsers",
	"adminEngineSecret",
];

let p = port();
await Promise.all([S.loadAdmin(p), S.loadAdmin(p), S.refreshAdmin(p)]);
for (const list of LISTS) eq(p.count(list), 1, list);
eq(admin.loaded, true);
eq(admin.data?.streams.length, 2);
eq(admin.data?.web, false);
eq(pendingPairs.n, 1);

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
eq(admin.data?.settings.read_only.player, false);
const before = p.count("saveAdminSettings");
eq(await S.save(p, "stream.max_live", 6), "read_only");
eq(p.count("saveAdminSettings"), before);
p.fail.saveAdminSettings = failure("invalid_setting", { key: "player.url" });
eq(await S.save(p, "player.url", "ftp://nope"), "invalid");
eq(admin.data?.settings.values["player.url"], "https://player.example");

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
S.draft("engine.url", "  ");
eq(await S.commit(p, { t: "text", key: "engine.url", allowEmpty: true }), "ok");
eq(p.count("saveAdminSettings"), 1);
S.draft("player.url", "  ");
eq(await S.commit(p, { t: "text", key: "player.url" }), "invalid");
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
const folders = must(admin.data).library.folders;
eq(must(folders[0]).scan?.progress, 0);
eq(must(folders[1]).scan, undefined);
gate();
p.gate = null;
eq(await scanning, true);
p.fail.adminScan = new Error("down");
eq(await S.scan(p), false);
eq(must(folders[1]).scan, undefined);
eq(must(folders[0]).scan?.progress, 0);

p.gate = new Promise<void>((done) => {
	gate = done;
});
const clearing = S.clearCache(p);
eq(admin.data?.cacheCleared, true);
eq(admin.data?.overview.storage.cache?.size, 0);
gate();
p.gate = null;
eq(await clearing, true);
p.fail.adminClearCache = new Error("down");
must(admin.data).cacheCleared = false;
must(must(admin.data).overview.storage.cache).size = 3200000000;
eq(await S.clearCache(p), false);
eq(admin.data?.cacheCleared, false);
eq(admin.data?.overview.storage.cache?.size, 3200000000);

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
p.engineUp = false;
await c.advance(2000);
eq(admin.restarting, true);
p.engineUp = true;
await c.advance(2000);
eq(admin.restarting, false);
eq(admin.lateRestart, false);
eq(admin.data?.overview.engine.reachable, true);

S.resetAdmin();
p = port();
await S.loadAdmin(p);
c = clock();
await S.restart(p, undefined, c.timers);
await c.advance(8000);
eq(admin.restarting, true);
await c.advance(2000);
eq(admin.restarting, false);

S.resetAdmin();
p = port();
await S.loadAdmin(p);
c = clock();
p.engineUp = false;
await S.restart(p, undefined, c.timers);
await c.advance(58_000);
eq(admin.lateRestart, false);
await c.advance(4000);
eq(admin.lateRestart, true);
eq(admin.restarting, true);
const lateCalls = p.count("adminOverview");
await c.advance(10_000);
ok(p.count("adminOverview") > lateCalls);
p.engineUp = true;
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
eq(admin.data, null);
eq(admin.loaded, false);
eq(pendingPairs.n, 0);
await S.loadPendingPairs(p);
eq(pendingPairs.n, 1);
p.fail.adminPairings = failure("forbidden");
await S.loadPendingPairs(p);
eq(pendingPairs.n, 0);

S.resetAdmin();
p = port();
await S.loadAdmin(p);
const sent: string[] = [];
const pairs = {
	fail: undefined as Error | undefined,
	async approvePairing(code: string) {
		sent.push(`approve ${code}`);
		if (pairs.fail) throw pairs.fail;
	},
	async denyPairing(code: string) {
		sent.push(`deny ${code}`);
		if (pairs.fail) throw pairs.fail;
	},
};
pairs.fail = new Error("down");
eq(await S.resolvePairing(pairs, "R4W-X9P", true, "Antoine"), "failed");
eq(admin.data?.pairings.length, 1);
pairs.fail = failure("no_pending_pairing");
eq(await S.resolvePairing(pairs, "R4W-X9P", true, "Antoine"), "gone");
eq(admin.data?.pairings.length, 0);
eq(pendingPairs.n, 0);
await S.refreshAdmin(p);
pairs.fail = undefined;
eq(await S.resolvePairing(pairs, "R4W-X9P", false, "Antoine"), "ok");
eq(
	admin.data?.devices.some((d) => d.id === "new-R4W-X9P"),
	false,
);
await S.refreshAdmin(p);
eq(await S.resolvePairing(pairs, "R4W-X9P", true, "Antoine"), "ok");
same(sent, ["approve R4W-X9P", "approve R4W-X9P", "deny R4W-X9P", "approve R4W-X9P"]);
eq(admin.data?.devices[0]?.name, "iPad mini");
same(admin.data?.fresh, ["iPad mini"]);
await S.refreshAdmin(p);
eq(admin.data?.devices[0]?.name, "iPad mini");
same(admin.data?.fresh, ["iPad mini"]);

let busyGate!: () => void;
p.gate = new Promise<void>((done) => {
	busyGate = done;
});
const saving = S.save(p, "stream.max_live", 4);
same(S.busy.keys, ["stream.max_live"]);
busyGate();
p.gate = null;
await saving;
same(S.busy.keys, []);

S.resetAdmin();
p = port();
const running = {
	folders: [
		{ id: "movies", name: "Movies", scan: { progress: 0.5, eta_seconds: 8 } },
		{ id: "series", name: "Series", scan: { progress: 0.2, eta_seconds: 20 } },
	],
};
const quiet = {
	folders: [
		{ id: "movies", name: "Movies" },
		{ id: "series", name: "Series" },
	],
	last_scan: { at: "2026-11-09T12:00:00Z", added: 3, replaced: 0, errors: 1 },
};
p.adminLibrary = async () => running as never;
await S.loadAdmin(p);
p.adminLibrary = async () =>
	({ ...running, folders: running.folders.slice(0, 1).concat(quiet.folders.slice(1)) }) as never;
await S.refreshLibrary(p);
same(S.scanDone.report, { finished: ["Series"], added: 0, errors: 0 });
S.scanDone.report = null;
p.adminLibrary = async () => quiet as never;
await S.refreshLibrary(p);
same(S.scanDone.report, { finished: ["Movies"], added: 3, errors: 1 });
S.scanDone.report = null;
await S.refreshLibrary(p);
eq(S.scanDone.report, null);

S.resetAdmin();
p = port();
p.secretSet = false;
await S.loadAdmin(p);
eq(must(admin.data).secret.set, false);
eq(await S.makeSecret(p), true);
eq(must(admin.data).secretShown, "s3cret");
eq(must(admin.data).secret.set, true);
await S.refreshAdmin(p);
eq(must(admin.data).secretShown, "s3cret");
S.hideSecret();
eq(must(admin.data).secretShown, undefined);
await S.refreshAdmin(p);
eq(must(admin.data).secretShown, undefined);
eq(must(admin.data).secret.set, true);
p.fail.adminRotateEngineSecret = failure("internal");
eq(await S.makeSecret(p), false);
eq(must(admin.data).secretShown, undefined);
S.pickUser("R4W-X9P", 2);
await S.refreshAdmin(p);
same(must(admin.data).pairFor, { "R4W-X9P": 2 });
same(
	must(admin.data).users.map((u) => u.id),
	[1, 2],
);
S.resetAdmin();
eq(admin.data, null);

S.resetAdmin();
p = port();
await S.loadAdmin(p);
p.fail.saveAdminSettings = failure("invalid_setting");
eq(await S.save(p, "player.origins", ["https://player.example", "nope"]), "invalid");
same(must(admin.data).settings.values["player.origins"], ["https://player.example"]);
p.fail.saveAdminSettings = undefined;
eq(await S.save(p, "player.origins", ["https://player.example"]), "ok");
eq(p.count("saveAdminSettings"), 1);
eq(await S.save(p, "player.origins", []), "ok");
same(p.calls.at(-1), ["saveAdminSettings", { "player.origins": [] }]);

function ok(v: unknown) {
	eq(!!v, true);
}
console.log("server-store-check: ok");
