// The device approval endpoints, the pairing lifetime and links, through the contract proxy.
import { strictEqual as eq, ok } from "node:assert";
import type { PairRequest } from "../../src/lib/core/types.ts";
import { startTarget, violationLines } from "./target.ts";

type ApiError = { error: { code: string } };
type DeviceCode = {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete: string;
};

const JSON_HEADERS = { "Content-Type": "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stops: (() => void)[] = [];
try {
	const main = await startTarget("main", ["--player-url", "http://localhost:1430"]);
	stops.push(main.stop);
	const { api } = main;
	const bearer = { Authorization: `Bearer ${await main.signIn()}` };
	const start1 = async () =>
		(await fetch(`${api}/auth/device/code`, {
			method: "POST",
			headers: JSON_HEADERS,
			body: JSON.stringify({ client_id: "c1", name: "framework-13", platform: "Linux" }),
		}).then((r) => r.json())) as DeviceCode;
	const poll = (device_code: string) =>
		fetch(`${api}/auth/device/token`, {
			method: "POST",
			headers: JSON_HEADERS,
			body: JSON.stringify({ device_code }),
		});
	const post = (code: string, action: string, headers: object = bearer) =>
		fetch(`${api}/auth/device/${code}/${action}`, { method: "POST", headers });
	const code404 = async (r: Response, want: string) => {
		eq(((await r.json()) as ApiError).error.code, want);
	};

	const a = await start1();
	eq(
		a.verification_uri_complete,
		`http://localhost:1430/pair?code=${a.user_code}`,
		"the pairing link points at the player",
	);
	eq(a.verification_uri, "http://localhost:1430/pair");

	const seen = await fetch(`${api}/auth/device/${a.user_code}`, { headers: bearer });
	eq(seen.status, 200);
	const req = (await seen.json()) as PairRequest;
	eq(req.name, "framework-13");
	eq(req.platform, "Linux");
	ok(!Number.isNaN(Date.parse(req.requested_at)), req.requested_at);
	ok(req.ip, "ip");

	const asDevice = await fetch(`${api}/auth/device/${a.user_code}`, {
		headers: { "X-API-Key": "nope" },
	});
	eq(asDevice.status, 401);
	const missing = await fetch(`${api}/auth/device/ZZZ-ZZZ`, { headers: bearer });
	eq(missing.status, 404);
	await code404(missing, "no_pending_pairing");

	eq((await post(a.user_code, "approve")).status, 204);
	const approved = await poll(a.device_code);
	eq(approved.status, 200);
	const key = ((await approved.json()) as { api_key: string }).api_key;
	ok(key, "api_key");
	const again = await post(a.user_code, "approve");
	eq(again.status, 404);
	await code404(again, "no_pending_pairing");

	const forbidden = await fetch(`${api}/auth/device/${a.user_code}`, {
		headers: { "X-API-Key": key },
	});
	eq(forbidden.status, 403);
	await code404(forbidden, "session_required");
	const b = await start1();
	const forbiddenPost = await post(b.user_code, "approve", { "X-API-Key": key });
	eq(forbiddenPost.status, 403);
	await code404(forbiddenPost, "session_required");

	eq((await post(b.user_code, "deny")).status, 204);
	const denied = await poll(b.device_code);
	eq(denied.status, 400);
	await code404(denied, "access_denied");

	const c = await start1();
	const loose = c.user_code.replace("-", "").toLowerCase();
	eq((await fetch(`${api}/auth/device/${loose}`, { headers: bearer })).status, 200);
	eq((await post(loose, "approve")).status, 204);

	if (main.kind === "mock") {
		const short = await startTarget("short", ["--pair-ttl", "1"]);
		stops.push(short.stop);
		const d = (await fetch(`${short.api}/auth/device/code`, {
			method: "POST",
			headers: JSON_HEADERS,
			body: JSON.stringify({ client_id: "c2", name: "tv", platform: "Android TV" }),
		}).then((r) => r.json())) as DeviceCode;
		eq(d.verification_uri_complete.endsWith(`/pair?code=${d.user_code}`), true);
		await sleep(1200);
		const late = await fetch(`${short.api}/auth/device/token`, {
			method: "POST",
			headers: JSON_HEADERS,
			body: JSON.stringify({ device_code: d.device_code }),
		});
		eq(late.status, 400);
		await code404(late, "expired_token");
		eq((await violationLines(short)).join("\n"), "", "contract report");
	}

	eq((await violationLines(main)).join("\n"), "", "contract report");
	console.log("pair-check: ok");
} finally {
	for (const stop of stops) stop();
}
