// The mock's browser sign-in: PKCE, password, rotating refresh tokens, revocation and CORS, all through the contract proxy.
import { strictEqual as eq, ok } from "node:assert";
import type { AdminDevice, AuthMethods } from "../../src/lib/core/types.ts";
import { kind, startTarget, violationLines } from "./target.ts";

type Tokens = {
	token_type: string;
	access_token: string;
	refresh_token: string;
	device_id: string;
};
type ApiError = { error: { code: string } };

const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const ORIGIN = "http://localhost:1430";
const REDIRECT = `${ORIGIN}/auth/callback`;

const t = await startTarget(
	"auth",
	kind === "mock" ? ["--clip", "/nonexistent.mkv", "--access-ttl", "2"] : [],
);

try {
	const api = t.api;
	const session = await t.cookie();

	const call = (path: string, init: RequestInit & { token?: string } = {}) => {
		const { token, ...rest } = init;
		return fetch(`${api}${path}`, {
			redirect: "manual",
			...rest,
			headers: {
				...(session && path.startsWith("/authorize") ? { Cookie: session } : {}),
				...(rest.body ? { "Content-Type": "application/json" } : {}),
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(rest.headers as Record<string, string>),
			},
		});
	};
	const token = (body: object) =>
		call("/auth/token", { method: "POST", body: JSON.stringify(body) });
	const grant = <T = Tokens>(body: object) => token(body).then((r) => r.json() as Promise<T>);

	const methods: AuthMethods = await call("/auth/methods").then((r) => r.json());
	if (kind === "mock") eq(methods.register_url, null);
	else ok(methods.register_url === null || methods.register_url.endsWith("/register"));

	const query = (redirect: string) =>
		new URLSearchParams({
			redirect_uri: redirect,
			state: "st-1",
			code_challenge: CHALLENGE,
			code_challenge_method: "S256",
		});
	const authorize = async (redirect = REDIRECT) => {
		const r = await call(`/authorize?${query(redirect)}`);
		eq(r.status, 302);
		return new URL(r.headers.get("location") as string);
	};
	eq((await call(`/authorize?${query("https://evil.example/cb")}`)).status, 400);
	const back = await authorize();
	eq(back.searchParams.get("state"), "st-1");
	const code = back.searchParams.get("code") as string;
	ok(code);

	const exchange = <T = Tokens>(c: string, verifier: string) =>
		grant<T>({
			grant_type: "authorization_code",
			code: c,
			code_verifier: verifier,
			redirect_uri: REDIRECT,
			device_name: "Firefox on Linux",
		});
	const first = await exchange(code, VERIFIER);
	eq(first.token_type, "Bearer");
	ok(first.access_token && first.refresh_token && first.device_id);
	eq((await exchange<ApiError>(code, VERIFIER)).error.code, "invalid_grant");

	const other = (await authorize()).searchParams.get("code") as string;
	eq((await exchange<ApiError>(other, "not-the-verifier")).error.code, "invalid_grant");

	const signIn = async () =>
		exchange((await authorize()).searchParams.get("code") as string, VERIFIER);
	const signed = await signIn();
	ok(signed.access_token);

	const LOOPBACK = "http://127.0.0.1:49152/callback";
	const appSignIn = async () =>
		grant<{ api_key: string; key_id: number }>({
			grant_type: "authorization_code",
			code: (await authorize(LOOPBACK)).searchParams.get("code"),
			code_verifier: VERIFIER,
			redirect_uri: LOOPBACK,
			client_id: "check-desktop",
			name: "Check desktop",
			platform: "linux",
		});
	const app = await appSignIn();
	ok(app.api_key);
	eq((await call("/me", { headers: { "X-API-Key": app.api_key } })).status, 200);
	const again = await appSignIn();
	eq((await call("/me", { headers: { "X-API-Key": again.api_key } })).status, 200);
	eq((await call("/me", { headers: { "X-API-Key": app.api_key } })).status, 401);

	eq((await call("/me", { token: signed.access_token })).status, 200);
	if (kind === "mock") {
		await new Promise((r) => setTimeout(r, 2500));
		const expired = await call("/me", { token: signed.access_token });
		eq(expired.status, 401);
		eq(((await expired.json()) as ApiError).error.code, "unauthorized");
	}

	const refreshed = await grant({
		grant_type: "refresh_token",
		refresh_token: signed.refresh_token,
	});
	ok(refreshed.refresh_token && refreshed.refresh_token !== signed.refresh_token);
	eq((await call("/me", { token: refreshed.access_token })).status, 200);

	eq(
		(await grant<ApiError>({ grant_type: "refresh_token", refresh_token: signed.refresh_token }))
			.error.code,
		"invalid_grant",
	);
	eq(
		(await grant<ApiError>({ grant_type: "refresh_token", refresh_token: refreshed.refresh_token }))
			.error.code,
		"invalid_grant",
	);

	// CORS is Streamline core's (`server.cors_origins`), which the stack's config leaves unset.
	if (kind === "mock") {
		const preflight = await call("/me", { method: "OPTIONS", headers: { Origin: ORIGIN } });
		eq(preflight.status, 204);
		eq(preflight.headers.get("access-control-allow-origin"), ORIGIN);
		const evil = await call("/me", {
			method: "OPTIONS",
			headers: { Origin: "https://evil.example" },
		});
		eq(evil.headers.get("access-control-allow-origin"), null);
	}

	const kept = await signIn();
	const devices: { items: AdminDevice[] } = await call("/devices", {
		token: kept.access_token,
	}).then((r) => r.json());
	const mine = devices.items.find((d) => d.id === kept.device_id);
	eq(mine.kind, "browser");
	eq(mine.current, true);
	eq(mine.platform, "Web browser");
	ok(mine.expires_at);
	eq((await call("/devices/current", { method: "DELETE", token: kept.access_token })).status, 204);
	eq((await call("/me", { token: kept.access_token })).status, 401);

	const lines = await violationLines(t);
	eq(lines.length, 0, lines.join("\n"));
	console.log("auth-flow-check: ok");
} finally {
	t.stop();
}
