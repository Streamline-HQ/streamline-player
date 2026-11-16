// The admin API of Server settings, through the contract proxy. On the mock it also drives the mock's demo data, restart and read-only lock.
import { strictEqual as eq, deepStrictEqual as same, ok } from "node:assert";
import type {
	AdminDevice,
	AdminLibrary,
	AdminOverview,
	AdminPairing,
	AdminSettings,
	AdminStream,
	AdminUser,
	EngineSecretStatus,
	Me,
} from "../../src/lib/core/types.ts";
import { kind, startTarget, violationLines, type Target } from "./target.ts";

const stops: (() => void)[] = [];
// A target with its admin routes and the bearer its calls carry.
async function start(name: string, who?: string, ...extra: string[]) {
	const t = await startTarget(name, ["--now", "1794225600", ...extra]);
	stops.push(t.stop);
	return {
		t,
		api: t.api,
		admin: `${t.api}/admin`,
		dev: `${t.mock}/dev`,
		token: await t.signIn(who),
	};
}
type Started = Awaited<ReturnType<typeof start>>;

const JSON_HEADERS = { "Content-Type": "application/json" };
let bearer = "";
const as = (s: Started) => {
	bearer = s.token;
	return s;
};
const send = (url: string, method: string, body?: unknown) =>
	fetch(url, {
		method,
		headers: { ...(body === undefined ? {} : JSON_HEADERS), Authorization: `Bearer ${bearer}` },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
const get = async <T>(url: string) => {
	const r = await send(url, "GET");
	eq(r.status, 200, url);
	return (await r.json()) as T;
};
const items = async <T>(url: string) => (await get<{ items: T[] }>(url)).items;
const errorOf = async (r: Response) =>
	((await r.json()) as { error: { code: string; owner?: string; key?: string } }).error;
const clean = async (t: Target) => {
	const lines = await violationLines(t);
	eq(lines.length, 0, lines.join("\n"));
};
const ORDER = (d: AdminDevice) => [d.current ? 0 : 1, d.streaming ? 0 : 1];
const ownFirst = (devices: AdminDevice[]) => {
	for (let i = 1; i < devices.length; i++) {
		const [a, b] = [ORDER(devices[i - 1]), ORDER(devices[i])];
		ok(a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]), "own first, then streaming");
		if (a.join() === b.join())
			ok(devices[i - 1].last_seen >= devices[i].last_seen, "newest first within a group");
	}
	eq(devices.filter((d) => d.current).length, 1);
};
const PLAYER_LISTS = ["player.origins", "player.app_links", "network.home"];

const roleCalls: [string, string, unknown?][] = [
	["GET", "/overview"],
	["GET", "/settings"],
	["PATCH", "/settings", { "player.url": "" }],
	["POST", "/restart", {}],
	["GET", "/streams"],
	["POST", "/streams/s1/stop", {}],
	["GET", "/pairings"],
	["POST", "/pairings/R4W-X9P/approve", { user_id: 1 }],
	["GET", "/users"],
	["GET", "/engine/secret"],
	["POST", "/engine/secret"],
	["GET", "/devices"],
	["DELETE", "/devices/d5"],
	["GET", "/library"],
	["POST", "/library/scan", {}],
	["POST", "/cache/clear"],
];
const forbidden = async (admin: string) => {
	for (const [method, path, body] of roleCalls) {
		const r = await send(`${admin}${path}`, method, body);
		eq(r.status, 403, `${method} ${path}`);
		eq((await errorOf(r)).code, "forbidden");
	}
};

type DeviceCode = { device_code: string; user_code: string };
const requestPairing = async (api: string, name: string) =>
	(await fetch(`${api}/auth/device/code`, {
		method: "POST",
		headers: JSON_HEADERS,
		body: JSON.stringify({ client_id: name, name, platform: "Android TV" }),
	}).then((r) => r.json())) as DeviceCode;

try {
	const main = as(await start("main", undefined, ...(kind === "mock" ? ["--demo-admin"] : [])));
	const { admin: a, t } = main;

	const streams = await items<AdminStream>(`${a}/streams`);
	for (const s of streams) ok(["copy", "transcode", "audio"].includes(s.mode), s.mode);
	ok(streams.every((s) => s.duration > s.position));
	if (kind === "mock") {
		eq(streams.map((s) => s.mode).join(), "copy,transcode,audio");
		eq((await items<AdminPairing>(`${a}/pairings`)).map((p) => p.user_code).join(), "R4W-X9P");
	}

	const devices = await items<AdminDevice>(`${a}/devices`);
	ownFirst(devices);
	ok(devices[0].current, "the caller's own device comes first");
	for (const d of devices) ok(d.kind === "app" || d.kind === "browser", d.kind);
	if (kind === "mock") {
		eq(devices.length, 8);
		eq(devices.filter((d) => d.kind === "app").length, 5);
		eq(devices.filter((d) => d.kind === "browser").length, 3);
	}

	const library = await get<AdminLibrary>(`${a}/library`);
	ok(library.folders.length > 0);
	if (kind === "mock") {
		eq(library.folders.length, 2);
		ok(library.last_scan);
	}

	const settings = await get<AdminSettings>(`${a}/settings`);
	eq(Object.keys(settings.values).length, 10);
	eq(Object.values(settings.owners).filter((o) => o === "engine").length, 4);
	eq(Object.values(settings.owners).filter((o) => o === "player").length, 6);
	same(settings.read_only, { engine: false, player: false });
	if (kind === "mock") {
		eq(settings.pending.length, 0);
		for (const key of PLAYER_LISTS) same(settings.values[key], []);
	} else {
		for (const key of PLAYER_LISTS) ok(Array.isArray(settings.values[key]), key);
	}

	const playerSaved = await send(`${a}/settings`, "PATCH", {
		"player.url": "http://localhost:1430",
		"player.origins": ["http://localhost:1430"],
		"network.home": ["192.168.1.0/24"],
	});
	eq(playerSaved.status, 200);
	const playerAfter = (await playerSaved.json()) as AdminSettings;
	if (kind === "mock") eq(playerAfter.pending.length, 0);
	eq(playerAfter.values["player.url"], "http://localhost:1430");
	same(playerAfter.values["player.origins"], ["http://localhost:1430"]);
	same(playerAfter.values["network.home"], ["192.168.1.0/24"]);
	// A key is pending while it differs from what the engine booted with, so the stack's engine, which boots on 4, gets 6 or 7.
	const live = settings.values["stream.max_live"] as number;
	const next = kind === "mock" ? 4 : live === 6 ? 7 : 6;
	const saved = await send(`${a}/settings`, "PATCH", { "stream.max_live": next });
	eq(saved.status, 200);
	const after = (await saved.json()) as AdminSettings;
	eq(after.pending.join(), "stream.max_live");
	eq(after.values["stream.max_live"], next);
	for (const [key, value] of [
		["stream.max_live", 0],
		["nope", 1],
		["stream.tonemap", "yes"],
		["player.origins", ["http://localhost:1430/path"]],
		["player.origins", "http://localhost:1430"],
		["network.home", ["not a network"]],
		["engine.url", "ftp://engine"],
		["player.url", "http://player?x=1"],
	] as const) {
		const r = await send(`${a}/settings`, "PATCH", { [key]: value });
		eq(r.status, 400, `${key}=${JSON.stringify(value)}`);
		const e = await errorOf(r);
		eq(e.code, "invalid_setting");
		eq(e.key, key);
	}
	const tonemap = (await get<AdminSettings>(`${a}/settings`)).values["stream.tonemap"];
	const mixed = await send(`${a}/settings`, "PATCH", { "stream.tonemap": !tonemap, nope: 1 });
	eq(mixed.status, 400);
	eq((await get<AdminSettings>(`${a}/settings`)).values["stream.tonemap"], tonemap);

	const unknown = await send(`${a}/streams/nope/stop`, "POST", {});
	eq(unknown.status, 404);
	eq((await errorOf(unknown)).code, "not_found");
	if (kind === "mock") {
		const stop = await send(`${a}/streams/s2/stop`, "POST", { message: "Need the bandwidth" });
		eq(stop.status, 204);
		eq((await items<AdminStream>(`${a}/streams`)).length, 2);
		eq((await send(`${a}/devices/d5`, "DELETE")).status, 204);
		eq((await items<AdminDevice>(`${a}/devices`)).length, 7);
	}
	const own = await send(`${a}/devices/${devices[0].id}`, "DELETE");
	eq(own.status, 409);
	eq((await errorOf(own)).code, "current_device");
	eq((await send(`${a}/devices/nope`, "DELETE")).status, 404);

	const movies = library.folders.find((f) => f.kind === "movies");
	ok(movies, "a movies folder");
	eq((await send(`${a}/library/scan`, "POST", { folder_id: movies.id })).status, 202);
	if (kind === "mock") {
		const scanning = (await get<AdminLibrary>(`${a}/library`)).folders;
		const progress = scanning.find((f) => f.id === movies.id).scan.progress;
		ok(progress >= 0 && progress < 1, String(progress));
		eq(scanning.filter((f) => f.scan).length, 1);
		eq((await send(`${main.dev}/admin/scan/finish`, "POST")).status, 204);
		const finished = await get<AdminLibrary>(`${a}/library`);
		ok(finished.folders.every((f) => !f.scan));
		ok(finished.last_scan.at !== library.last_scan.at, "last_scan moved");
	}

	const overview = await get<AdminOverview>(`${a}/overview`);
	eq(overview.extension.version.length > 0, true);
	eq(overview.engine.reachable, true);
	ok(["vaapi", "software"].includes(overview.engine.hw?.mode ?? ""), overview.engine.hw?.mode);
	ok(overview.folders.reachable <= overview.folders.total);
	ok(overview.streamline_url.startsWith("http://"), overview.streamline_url);
	if (kind === "mock") {
		eq(overview.engine.hw?.mode, "vaapi");
		same(overview.folders, { reachable: 2, total: 2 });
		eq((overview.storage.cache?.size ?? 0) > 0, true);
	}
	const cleared = await send(`${a}/cache/clear`, "POST");
	eq(cleared.status, 200);
	ok(typeof ((await cleared.json()) as { freed: number }).freed === "number");
	const cache = (await get<AdminOverview>(`${a}/overview`)).storage.cache;
	// The real engine's clear frees only orphaned work and expired outputs, and the scan above queues new analysis, so it may not be empty.
	if (kind === "mock") eq(cache?.size, 0);
	else ok(typeof cache?.size === "number", "the engine still reports its cache");

	const status = await get<EngineSecretStatus>(`${a}/engine/secret`);
	if (kind === "mock") {
		same(status, { set: false });
		const rotated = await send(`${a}/engine/secret`, "POST");
		eq(rotated.status, 200);
		const { secret } = (await rotated.json()) as { secret: string };
		ok(/^[A-Za-z0-9_-]{43}$/.test(secret), secret);
		const set = await get<EngineSecretStatus>(`${a}/engine/secret`);
		eq(set.set, true);
		ok(set.created_at && !Number.isNaN(Date.parse(set.created_at)), "created_at");
		ok(!JSON.stringify(set).includes(secret), "the secret is never read back");
		const again = (await (await send(`${a}/engine/secret`, "POST")).json()) as { secret: string };
		ok(again.secret !== secret, "rotating makes a new secret");
	} else {
		// Rotating the stack's secret would cut the engine off from every check after this one.
		eq(status.set, true);
		ok(status.created_at && !Number.isNaN(Date.parse(status.created_at)), "created_at");
	}

	const users = await items<AdminUser>(`${a}/users`);
	same(
		users.map((u) => u.name),
		users.map((u) => u.name).sort((x, y) => x.localeCompare(y)),
	);
	for (const u of users) ok(["Admin", "Member"].includes(u.role), u.role);
	if (kind === "mock") {
		eq(users.map((u) => u.name).join(), "Antoine Langlois,Camille Roux,Hugo Bernard");
		eq(users.map((u) => u.role).join(), "Admin,Member,Member");
	}
	const member = users.find((u) => u.role === "Member");
	ok(member, "a member to approve for");

	// The proxy rightly reports an approval without a user, so it goes to a proxy of its own.
	const pairing =
		kind === "mock" ? { user_code: "R4W-X9P" } : await requestPairing(main.api, "tv-1");
	const lax = await start("lax", undefined, ...(kind === "mock" ? ["--demo-admin"] : []));
	if (kind === "stack") bearer = main.token;
	else bearer = lax.token;
	const noUser = await send(`${lax.admin}/pairings/${pairing.user_code}/approve`, "POST", {});
	eq(noUser.status, 400);
	eq((await errorOf(noUser)).code, "invalid_request");
	as(main);
	const badUser = await send(`${a}/pairings/${pairing.user_code}/approve`, "POST", {
		user_id: 999999,
	});
	eq(badUser.status, 404);
	eq((await errorOf(badUser)).code, "not_found");
	const waiting = await items<AdminPairing>(`${a}/pairings`);
	ok(waiting.some((p) => p.user_code === pairing.user_code));
	const approve = await send(`${a}/pairings/${pairing.user_code}/approve`, "POST", {
		user_id: member.id,
	});
	eq(approve.status, 204);
	ok(!(await items<AdminPairing>(`${a}/pairings`)).some((p) => p.user_code === pairing.user_code));
	const gone = await send(`${a}/pairings/${pairing.user_code}/approve`, "POST", {
		user_id: member.id,
	});
	eq(gone.status, 404);
	eq((await errorOf(gone)).code, "no_pending_pairing");

	if (kind === "mock") {
		eq((await send(`${a}/restart`, "POST", {})).status, 202);
		const down = await get<AdminOverview>(`${a}/overview`);
		same(down.engine, { reachable: false });
		same(down.storage, {});
		const downSettings = await get<AdminSettings>(`${a}/settings`);
		eq("stream.max_live" in downSettings.values, false);
		eq("player.url" in downSettings.values, true);
		eq((await errorOf(await send(`${a}/cache/clear`, "POST"))).code, "engine_unavailable");
		eq((await send(`${main.dev}/admin/restart/finish`, "POST")).status, 204);
		const back = await get<AdminSettings>(`${a}/settings`);
		eq(back.pending.length, 0);
		eq(back.values["stream.max_live"], 4);
		eq((await get<AdminOverview>(`${a}/overview`)).engine.reachable, true);
	}
	await clean(t);

	if (kind === "mock") {
		const locked = as(await start("locked", undefined, "--read-only"));
		const refused = await send(`${locked.admin}/settings`, "PATCH", { "stream.max_live": 3 });
		eq(refused.status, 409);
		const lockedError = await errorOf(refused);
		eq(lockedError.code, "read_only");
		eq(lockedError.owner, "engine");
		same((await get<AdminSettings>(`${locked.admin}/settings`)).read_only, {
			engine: true,
			player: false,
		});
		eq(
			(await send(`${locked.admin}/settings`, "PATCH", { "player.url": "http://localhost:1430" }))
				.status,
			200,
		);
		await clean(locked.t);
	}

	// A member signed in on the same Streamline, or the mock told to be one.
	const asMember =
		kind === "mock"
			? await start("member", undefined, "--demo-admin", "--role", "member")
			: await start("member", "ana");
	as(asMember);
	eq((await get<Me>(`${asMember.api}/me`)).role, "Member");
	await forbidden(asMember.admin);
	await clean(asMember.t);

	as(main);
	if (kind === "mock") {
		eq((await get<Me>(`${main.api}/me`)).role, "Admin");
		eq((await send(`${main.dev}/role/member`, "POST")).status, 204);
		eq((await get<Me>(`${main.api}/me`)).role, "Member");
		await forbidden(main.admin);
		eq((await send(`${main.dev}/role/admin`, "POST")).status, 204);
		eq((await send(`${main.admin}/overview`, "GET")).status, 200);

		const plain = as(await start("plain"));
		eq((await items<AdminStream>(`${plain.admin}/streams`)).length, 0);
		eq((await items<AdminPairing>(`${plain.admin}/pairings`)).length, 0);
		eq((await items<AdminDevice>(`${plain.admin}/devices`)).length >= 4, true);
		eq((await get<AdminLibrary>(`${plain.admin}/library`)).folders.length, 2);
		eq((await get<AdminSettings>(`${plain.admin}/settings`)).pending.length, 0);
		await clean(plain.t);
	} else {
		eq((await get<Me>(`${main.api}/me`)).role, "Admin");
	}

	console.log("admin-check: ok");
} finally {
	for (const stop of stops) stop();
}
