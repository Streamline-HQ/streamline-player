// The admin API of Server settings, through the contract proxy.
import { spawn } from "node:child_process";
import { strictEqual as eq, deepStrictEqual as same, ok } from "node:assert";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

function firstLine(child: ReturnType<typeof spawn>, pattern: RegExp) {
	return new Promise<string>((resolve, reject) => {
		child.once("exit", (code) => reject(new Error(`exited with ${code} before ${pattern}`)));
		let seen = "";
		child.stdout?.on("data", (chunk) => {
			seen += String(chunk);
			const m = pattern.exec(seen);
			if (m) resolve(m[1]);
		});
	});
}

const children: ReturnType<typeof spawn>[] = [];
const dir = mkdtempSync(join(tmpdir(), "admin-check-"));

async function start(name: string, ...extra: string[]) {
	const mock = spawn(
		"python3",
		[
			"dev/mock-streamline.py",
			"--listen",
			"127.0.0.1:0",
			"--secret",
			"check",
			"--engine",
			"http://127.0.0.1:9",
			"--now",
			"1794225600",
			...extra,
		],
		{ stdio: ["ignore", "pipe", "ignore"] },
	);
	children.push(mock);
	const report = join(dir, `${name}.jsonl`);
	const mockAt = await firstLine(mock, /listening on (\S+)/);
	const proxy = spawn(
		process.execPath,
		[
			"dev/contract/proxy.ts",
			"--listen",
			"127.0.0.1:0",
			"--upstream",
			`http://${mockAt}`,
			"--spec",
			"docs/contract/player.openapi.yaml",
			"--report",
			report,
		],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);
	children.push(proxy);
	const root = `http://${await firstLine(proxy, /listening on (\S+)/)}`;
	return {
		api: `${root}/extensions/player`,
		dev: `http://${mockAt}/dev`,
		admin: `${root}/extensions/player/admin`,
		report,
	};
}

const violations = (report: string) =>
	existsSync(report) ? readFileSync(report, "utf8").split("\n").filter(Boolean) : [];
const clean = (report: string) => eq(violations(report).length, 0, violations(report).join("\n"));
const JSON_HEADERS = { "Content-Type": "application/json" };
const send = (url: string, method: string, body?: unknown) =>
	fetch(url, {
		method,
		headers: body === undefined ? {} : JSON_HEADERS,
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
const ORDER = (d: AdminDevice) => [d.current ? 0 : 1, d.streaming ? 0 : 1];

try {
	const demo = await start("demo", "--demo-admin");
	const a = demo.admin;

	const streams = await items<AdminStream>(`${a}/streams`);
	eq(streams.map((s) => s.mode).join(), "copy,transcode,audio");
	ok(streams.every((s) => s.duration > s.position));
	eq((await items<AdminPairing>(`${a}/pairings`)).map((p) => p.user_code).join(), "R4W-X9P");

	const devices = await items<AdminDevice>(`${a}/devices`);
	eq(devices.length, 8);
	eq(devices[0].current, true);
	for (let i = 1; i < devices.length; i++) {
		const [a, b] = [ORDER(devices[i - 1]), ORDER(devices[i])];
		ok(a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]), "own first, then streaming");
		if (a.join() === b.join())
			ok(devices[i - 1].last_seen >= devices[i].last_seen, "newest first within a group");
	}
	eq(devices.filter((d) => d.current).length, 1);
	eq(devices.filter((d) => d.kind === "app").length, 6);
	eq(devices.filter((d) => d.kind === "browser").length, 2);

	const library = await get<AdminLibrary>(`${a}/library`);
	eq(library.folders.length, 2);
	ok(library.last_scan);

	const settings = await get<AdminSettings>(`${a}/settings`);
	eq(Object.keys(settings.values).length, 10);
	eq(Object.values(settings.owners).filter((o) => o === "engine").length, 4);
	eq(Object.values(settings.owners).filter((o) => o === "player").length, 6);
	same(settings.read_only, { engine: false, player: false });
	eq(settings.pending.length, 0);
	for (const key of ["player.origins", "player.app_links", "network.home"])
		same(settings.values[key], []);

	const playerSaved = await send(`${a}/settings`, "PATCH", {
		"player.url": "http://localhost:1430",
		"player.origins": ["http://localhost:1430"],
		"network.home": ["192.168.1.0/24"],
	});
	eq(playerSaved.status, 200);
	const playerAfter = (await playerSaved.json()) as AdminSettings;
	eq(playerAfter.pending.length, 0);
	eq(playerAfter.values["player.url"], "http://localhost:1430");
	same(playerAfter.values["player.origins"], ["http://localhost:1430"]);
	const saved = await send(`${a}/settings`, "PATCH", { "stream.max_live": 4 });
	eq(saved.status, 200);
	const after = (await saved.json()) as AdminSettings;
	eq(after.pending.join(), "stream.max_live");
	eq(after.values["stream.max_live"], 4);
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
	const mixed = await send(`${a}/settings`, "PATCH", { "stream.tonemap": false, nope: 1 });
	eq(mixed.status, 400);
	eq((await get<AdminSettings>(`${a}/settings`)).values["stream.tonemap"], true);

	const stop = await send(`${a}/streams/s2/stop`, "POST", { message: "Need the bandwidth" });
	eq(stop.status, 204);
	eq((await items<AdminStream>(`${a}/streams`)).length, 2);
	const unknown = await send(`${a}/streams/nope/stop`, "POST", {});
	eq(unknown.status, 404);
	eq((await errorOf(unknown)).code, "not_found");

	eq((await send(`${a}/devices/d5`, "DELETE")).status, 204);
	eq((await items<AdminDevice>(`${a}/devices`)).length, 7);
	const own = await send(`${a}/devices/${devices[0].id}`, "DELETE");
	eq(own.status, 409);
	eq((await errorOf(own)).code, "current_device");
	eq((await send(`${a}/devices/nope`, "DELETE")).status, 404);

	const movies = library.folders.find((f) => f.kind === "movies");
	eq((await send(`${a}/library/scan`, "POST", { folder_id: movies.id })).status, 202);
	const scanning = (await get<AdminLibrary>(`${a}/library`)).folders;
	const progress = scanning.find((f) => f.id === movies.id).scan.progress;
	ok(progress >= 0 && progress < 1, String(progress));
	eq(scanning.filter((f) => f.scan).length, 1);
	eq((await send(`${demo.dev}/admin/scan/finish`, "POST")).status, 204);
	const finished = await get<AdminLibrary>(`${a}/library`);
	ok(finished.folders.every((f) => !f.scan));
	ok(finished.last_scan.at !== library.last_scan.at, "last_scan moved");

	const overview = await get<AdminOverview>(`${a}/overview`);
	eq(overview.extension.version.length > 0, true);
	eq(overview.engine.reachable, true);
	eq(overview.engine.hw?.mode, "vaapi");
	same(overview.folders, { reachable: 2, total: 2 });
	ok(overview.streamline_url.startsWith("http://"), overview.streamline_url);
	eq((overview.storage.cache?.size ?? 0) > 0, true);
	eq((await send(`${a}/cache/clear`, "POST")).status, 200);
	eq((await get<AdminOverview>(`${a}/overview`)).storage.cache?.size, 0);

	const unset = await get<EngineSecretStatus>(`${a}/engine/secret`);
	same(unset, { set: false });
	const rotated = await send(`${a}/engine/secret`, "POST");
	eq(rotated.status, 200);
	const { secret } = (await rotated.json()) as { secret: string };
	ok(/^[A-Za-z0-9_-]{43}$/.test(secret), secret);
	const status = await get<EngineSecretStatus>(`${a}/engine/secret`);
	eq(status.set, true);
	ok(status.created_at && !Number.isNaN(Date.parse(status.created_at)), "created_at");
	ok(!JSON.stringify(status).includes(secret), "the secret is never read back");
	const again = (await (await send(`${a}/engine/secret`, "POST")).json()) as { secret: string };
	ok(again.secret !== secret, "rotating makes a new secret");

	const users = await items<AdminUser>(`${a}/users`);
	eq(users.map((u) => u.name).join(), "Antoine Langlois,Camille Roux,Hugo Bernard");
	eq(users.map((u) => u.role).join(), "Admin,Member,Member");
	const lax = await start("lax", "--demo-admin");
	const noUser = await send(`${lax.admin}/pairings/R4W-X9P/approve`, "POST", {});
	eq(noUser.status, 400);
	eq((await errorOf(noUser)).code, "invalid_request");
	const badUser = await send(`${a}/pairings/R4W-X9P/approve`, "POST", { user_id: 999 });
	eq(badUser.status, 404);
	eq((await errorOf(badUser)).code, "not_found");
	eq((await items<AdminPairing>(`${a}/pairings`)).length, 1);
	eq((await send(`${a}/pairings/R4W-X9P/approve`, "POST", { user_id: users[1].id })).status, 204);
	eq((await items<AdminPairing>(`${a}/pairings`)).length, 0);
	const gone = await send(`${a}/pairings/R4W-X9P/approve`, "POST", { user_id: users[1].id });
	eq(gone.status, 404);
	eq((await errorOf(gone)).code, "no_pending_pairing");

	eq((await send(`${a}/restart`, "POST", {})).status, 202);
	const down = await get<AdminOverview>(`${a}/overview`);
	same(down.engine, { reachable: false });
	same(down.storage, {});
	const downSettings = await get<AdminSettings>(`${a}/settings`);
	eq("stream.max_live" in downSettings.values, false);
	eq("player.url" in downSettings.values, true);
	eq((await errorOf(await send(`${a}/cache/clear`, "POST"))).code, "engine_unavailable");
	eq((await send(`${demo.dev}/admin/restart/finish`, "POST")).status, 204);
	const back = await get<AdminSettings>(`${a}/settings`);
	eq(back.pending.length, 0);
	eq(back.values["stream.max_live"], 4);
	eq((await get<AdminOverview>(`${a}/overview`)).engine.reachable, true);
	clean(demo.report);

	const locked = await start("locked", "--read-only");
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
	clean(locked.report);

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
	const member = await start("member", "--demo-admin", "--role", "member");
	eq((await get<Me>(`${member.api}/me`)).role, "Member");
	await forbidden(member.admin);
	clean(member.report);

	eq((await get<Me>(`${demo.api}/me`)).role, "Admin");
	eq((await send(`${demo.dev}/role/member`, "POST")).status, 204);
	eq((await get<Me>(`${demo.api}/me`)).role, "Member");
	await forbidden(demo.admin);
	eq((await send(`${demo.dev}/role/admin`, "POST")).status, 204);
	eq((await send(`${demo.admin}/overview`, "GET")).status, 200);

	const plain = await start("plain");
	eq((await items<AdminStream>(`${plain.admin}/streams`)).length, 0);
	eq((await items<AdminPairing>(`${plain.admin}/pairings`)).length, 0);
	eq((await items<AdminDevice>(`${plain.admin}/devices`)).length >= 4, true);
	eq((await get<AdminLibrary>(`${plain.admin}/library`)).folders.length, 2);
	eq((await get<AdminSettings>(`${plain.admin}/settings`)).pending.length, 0);
	clean(plain.report);

	console.log("admin-check: ok");
} finally {
	for (const c of children) c.kill();
}
