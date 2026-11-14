// The admin API of Server settings, through the contract proxy.
import { spawn } from "node:child_process";
import { strictEqual as eq, ok } from "node:assert";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
		api: `${root}/api/v1`,
		dev: `http://${mockAt}/dev`,
		admin: `${root}/api/v1/admin`,
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
const get = async (url: string) => {
	const r = await send(url, "GET");
	eq(r.status, 200, url);
	return (await r.json()) as any;
};
const items = async (url: string) => (await get(url)).items as any[];
const errorOf = async (r: Response) => ((await r.json()) as any).error;

try {
	const demo = await start("demo", "--demo-admin");
	const a = demo.admin;

	const streams = await items(`${a}/streams`);
	eq(streams.map((s) => s.mode).join(), "copy,transcode,audio");
	ok(streams.every((s) => s.duration > s.position));
	eq((await items(`${a}/pairings`)).map((p) => p.user_code).join(), "R4W-X9P");

	const devices = await items(`${a}/devices`);
	eq(devices.length, 8);
	eq(devices[0].current, true);
	eq(devices.filter((d) => d.current).length, 1);
	eq(devices.filter((d) => d.kind === "app").length, 6);
	eq(devices.filter((d) => d.kind === "browser").length, 2);

	const library = await get(`${a}/library`);
	eq(library.folders.length, 2);
	ok(library.last_scan);

	const logs = await items(`${a}/logs`);
	eq(logs.length, 9);
	for (let i = 1; i < logs.length; i++) ok(logs[i - 1].id > logs[i].id, "newest first");
	eq((await items(`${a}/logs?level=warn`)).length, 2);
	eq((await items(`${a}/logs?level=error`)).length, 1);
	eq((await items(`${a}/logs?after=${logs[2].id}`)).length, 2);

	const settings = await get(`${a}/settings`);
	eq(Object.keys(settings.values).length, 15);
	eq(Object.values(settings.owners).filter((o) => o === "engine").length, 4);
	eq(settings.pending.length, 0);

	const saved = await send(`${a}/settings`, "PATCH", { "log.app.level": "debug" });
	eq(saved.status, 200);
	const after = (await saved.json()) as any;
	eq(after.pending.join(), "log.app.level");
	eq(after.values["log.app.level"], "debug");
	for (const body of [{ "stream.max_live": 0 }, { nope: 1 }, { "stream.tonemap": "yes" }]) {
		const r = await send(`${a}/settings`, "PATCH", body);
		eq(r.status, 400);
		eq((await errorOf(r)).code, "invalid_setting");
	}
	const mixed = await send(`${a}/settings`, "PATCH", { "stream.max_live": 4, nope: 1 });
	eq(mixed.status, 400);
	eq((await get(`${a}/settings`)).values["stream.max_live"], 2);

	const stop = await send(`${a}/streams/s2/stop`, "POST", { message: "Need the bandwidth" });
	eq(stop.status, 204);
	eq((await items(`${a}/streams`)).length, 2);
	const unknown = await send(`${a}/streams/nope/stop`, "POST", {});
	eq(unknown.status, 404);
	eq((await errorOf(unknown)).code, "not_found");

	eq((await send(`${a}/devices/d5`, "DELETE")).status, 204);
	eq((await items(`${a}/devices`)).length, 7);
	const own = await send(`${a}/devices/${devices[0].id}`, "DELETE");
	eq(own.status, 409);
	eq((await errorOf(own)).code, "current_device");
	eq((await send(`${a}/devices/nope`, "DELETE")).status, 404);

	const movies = library.folders.find((f: any) => f.kind === "movies");
	eq((await send(`${a}/library/scan`, "POST", { folder_id: movies.id })).status, 202);
	const scanning = (await get(`${a}/library`)).folders;
	const progress = scanning.find((f: any) => f.id === movies.id).scan.progress;
	ok(progress >= 0 && progress < 1, String(progress));
	eq(scanning.filter((f: any) => f.scan).length, 1);
	eq((await send(`${demo.dev}/admin/scan/finish`, "POST")).status, 204);
	const finished = await get(`${a}/library`);
	ok(finished.folders.every((f: any) => !f.scan));
	ok(finished.last_scan.at !== library.last_scan.at, "last_scan moved");

	const started = (await get(`${a}/overview`)).server.started_at;
	eq((await get(`${a}/overview`)).storage.cache.size > 0, true);
	eq((await send(`${a}/cache/clear`, "POST")).status, 200);
	eq((await get(`${a}/overview`)).storage.cache.size, 0);

	eq((await send(`${a}/restart`, "POST", {})).status, 202);
	const down = await send(`${a}/overview`, "GET");
	eq(down.status, 503);
	eq((await errorOf(down)).code, "server_restarting");
	eq((await send(`${demo.dev}/admin/restart/finish`, "POST")).status, 204);
	eq((await get(`${a}/settings`)).pending.length, 0);
	ok((await get(`${a}/overview`)).server.started_at > started, "started_at moved");

	const zip = await send(`${a}/logs/download`, "GET");
	eq(zip.status, 200);
	eq(zip.headers.get("content-type"), "application/zip");
	ok(/filename="streamline-logs\.zip"/.test(zip.headers.get("content-disposition") ?? ""));
	eq(new Uint8Array(await zip.arrayBuffer()).slice(0, 2).join(), "80,75");
	clean(demo.report);

	const locked = await start("locked", "--read-only");
	const refused = await send(`${locked.admin}/settings`, "PATCH", { "log.app.level": "debug" });
	eq(refused.status, 409);
	eq((await errorOf(refused)).code, "read_only");
	eq((await get(`${locked.admin}/settings`)).read_only.streamline, true);
	clean(locked.report);

	const engineLocked = await start("engine-locked", "--read-only=engine");
	eq(
		(await send(`${engineLocked.admin}/settings`, "PATCH", { "log.app.level": "debug" })).status,
		200,
	);
	const engineRefused = await send(`${engineLocked.admin}/settings`, "PATCH", {
		"stream.max_live": 3,
	});
	eq(engineRefused.status, 409);
	eq((await errorOf(engineRefused)).owner, "engine");
	clean(engineLocked.report);

	const roleCalls: [string, string, unknown?][] = [
		["GET", "/overview"],
		["GET", "/settings"],
		["PATCH", "/settings", { "log.app.level": "debug" }],
		["POST", "/restart", {}],
		["GET", "/streams"],
		["POST", "/streams/s1/stop", {}],
		["GET", "/pairings"],
		["GET", "/devices"],
		["DELETE", "/devices/d5"],
		["GET", "/library"],
		["POST", "/library/scan", {}],
		["POST", "/cache/clear"],
		["GET", "/logs"],
		["GET", "/logs/download"],
	];
	const forbidden = async (admin: string) => {
		for (const [method, path, body] of roleCalls) {
			const r = await send(`${admin}${path}`, method, body);
			eq(r.status, 403, `${method} ${path}`);
			eq((await errorOf(r)).code, "forbidden");
		}
	};
	const member = await start("member", "--demo-admin", "--role", "member");
	eq((await get(`${member.api}/me`)).role, "Member");
	await forbidden(member.admin);
	clean(member.report);

	eq((await get(`${demo.api}/me`)).role, "Admin");
	eq((await send(`${demo.dev}/role/member`, "POST")).status, 204);
	eq((await get(`${demo.api}/me`)).role, "Member");
	await forbidden(demo.admin);
	eq((await send(`${demo.dev}/role/admin`, "POST")).status, 204);
	eq((await send(`${demo.admin}/overview`, "GET")).status, 200);

	const plain = await start("plain");
	eq((await items(`${plain.admin}/streams`)).length, 0);
	eq((await items(`${plain.admin}/pairings`)).length, 0);
	eq((await items(`${plain.admin}/devices`)).length >= 4, true);
	eq((await get(`${plain.admin}/library`)).folders.length, 2);
	eq((await items(`${plain.admin}/logs`)).length, 10);
	eq((await get(`${plain.admin}/settings`)).pending.length, 0);
	clean(plain.report);

	console.log("admin-check: ok");
} finally {
	for (const c of children) c.kill();
}
