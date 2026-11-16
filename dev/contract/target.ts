// What a contract check talks to: the mock Streamline, or a real Streamline with the extension and the engine.
// Either sits behind a contract proxy that writes every exchange off the OpenAPI contract to `violations`.
//   CONTRACT_TARGET=stack STACK_INFO=<the line e2e/cmd/stack printed, as a file> node dev/contract/<check>.ts
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Kind = "mock" | "stack";

export type Target = {
	kind: Kind;
	// The proxy's `/extensions/player`.
	api: string;
	// The proxy's origin.
	root: string;
	// The target's own `/extensions/player`, past the proxy, for requests the contract has no place for.
	direct: string;
	// The file the proxy appends contract violations to; absent when there are none.
	violations: string;
	// An access token of a browser signed in through the sign-in page. `who` names a stack member (ana, ben); the admin by default.
	signIn: (who?: string) => Promise<string>;
	// A native app's device key, from the loopback sign-in. A second call with the same client id replaces the first key.
	appKey: (clientId: string, who?: string) => Promise<string>;
	// The Streamline session cookie header for /authorize; empty on the mock, which has no session.
	cookie: (who?: string) => Promise<string>;
	// The mock's own origin, for /dev routes; absent on the stack.
	mock?: string;
	// The stack's engine, absent on the mock.
	engine?: string;
	stop: () => void;
};

type StackInfo = {
	url: string;
	api: string;
	engine?: string;
	admin: { email: string; password: string };
	users: { name: string; email: string; password: string }[];
};

export const kind: Kind = process.env.CONTRACT_TARGET === "stack" ? "stack" : "mock";

const ORIGIN = "http://localhost:1430";
const REDIRECT = `${ORIGIN}/signin/callback`;
const LOOPBACK = "http://127.0.0.1:49152/callback";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const SESSION_COOKIE = "streamline_session";
const JSON_HEADERS = { "Content-Type": "application/json" };

const children = new Set<ChildProcess>();
process.on("exit", () => {
	for (const c of children) c.kill();
});

function firstLine(child: ChildProcess, pattern: RegExp) {
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

function stackInfo(): StackInfo {
	const path = process.env.STACK_INFO;
	if (!path)
		throw new Error(
			"CONTRACT_TARGET=stack needs STACK_INFO, the file holding the stack's JSON line",
		);
	return JSON.parse(readFileSync(path, "utf8"));
}

// Streamline's login allows five attempts per fifteen minutes, and each check is its own process, so sessions are shared through a file.
async function sessionOf(info: StackInfo, who?: string): Promise<string> {
	const file = `${process.env.STACK_INFO}.sessions.json`;
	const user = who ? info.users.find((u) => u.name === who) : info.admin;
	if (!user) throw new Error(`the stack has no member named ${who}`);
	let known: Record<string, string> = {};
	try {
		known = JSON.parse(readFileSync(file, "utf8"));
	} catch {}
	if (known[user.email]) return known[user.email];
	const res = await fetch(`${info.url}/auth/login`, {
		method: "POST",
		headers: JSON_HEADERS,
		body: JSON.stringify({ email: user.email, password: user.password }),
	});
	if (res.status !== 204) throw new Error(`login as ${user.email}: ${res.status}`);
	const cookie = res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
	if (!cookie) throw new Error("the login did not set a session cookie");
	known[user.email] = cookie.slice(SESSION_COOKIE.length + 1);
	writeFileSync(file, JSON.stringify(known));
	return known[user.email];
}

export async function startTarget(name: string, mockArgs: string[] = []): Promise<Target> {
	const dir = mkdtempSync(join(tmpdir(), `contract-${name}-`));
	const violations = join(dir, "violations.jsonl");
	let upstream: string;
	let mockAt: string | undefined;
	let mock: ChildProcess | undefined;
	let info: StackInfo | undefined;
	if (kind === "mock") {
		mock = spawn(
			"python3",
			[
				...["dev/mock-streamline.py", "--listen", "127.0.0.1:0", "--secret", "check"],
				...["--engine", "http://127.0.0.1:9", ...mockArgs],
			],
			{ stdio: ["ignore", "pipe", "ignore"] },
		);
		children.add(mock);
		mockAt = `http://${await firstLine(mock, /listening on (\S+)/)}`;
		upstream = mockAt;
	} else {
		info = stackInfo();
		upstream = info.url;
	}
	const proxy = spawn(
		process.execPath,
		[
			...["dev/contract/proxy.ts", "--listen", "127.0.0.1:0", "--upstream", upstream],
			...["--spec", "docs/contract/player.openapi.yaml", "--report", violations],
		],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);
	children.add(proxy);
	const root = `http://${await firstLine(proxy, /listening on (\S+)/)}`;
	const api = `${root}/extensions/player`;
	// Sign-in goes straight to the target: the proxy only records what the checks themselves exchange.
	const direct = `${upstream}/extensions/player`;

	const cookie = async (who?: string) =>
		info ? `${SESSION_COOKIE}=${await sessionOf(info, who)}` : "";

	async function code(redirect: string, who?: string) {
		const query = new URLSearchParams({
			redirect_uri: redirect,
			state: "check",
			code_challenge: CHALLENGE,
			code_challenge_method: "S256",
		});
		const back = await fetch(`${direct}/authorize?${query}`, {
			redirect: "manual",
			headers: info ? { Cookie: await cookie(who) } : {},
		});
		const location = back.headers.get("location");
		const found = location && new URL(location).searchParams.get("code");
		if (!found) throw new Error(`authorize answered ${back.status} ${location ?? ""}`);
		return found;
	}
	const token = async <T>(body: object) => {
		const res = await fetch(`${direct}/auth/token`, {
			method: "POST",
			headers: JSON_HEADERS,
			body: JSON.stringify(body),
		});
		if (res.status !== 200) throw new Error(`token answered ${res.status} ${await res.text()}`);
		return (await res.json()) as T;
	};

	const signIn = async (who?: string) =>
		(
			await token<{ access_token: string }>({
				grant_type: "authorization_code",
				code: await code(REDIRECT, who),
				code_verifier: VERIFIER,
				redirect_uri: REDIRECT,
				device_name: "Chrome",
			})
		).access_token;
	const appKey = async (clientId: string, who?: string) =>
		(
			await token<{ api_key: string }>({
				grant_type: "authorization_code",
				code: await code(LOOPBACK, who),
				code_verifier: VERIFIER,
				redirect_uri: LOOPBACK,
				client_id: clientId,
				name: clientId,
				platform: "linux",
			})
		).api_key;

	if (info) {
		// The web player's origin has to be on the extension's list before a browser may sign in.
		const key = await appKey("contract-setup");
		const saved = await fetch(`${direct}/admin/settings`, {
			method: "PATCH",
			headers: { ...JSON_HEADERS, "X-API-Key": key },
			body: JSON.stringify({ "player.url": ORIGIN, "player.origins": [ORIGIN] }),
		});
		if (saved.status !== 200) throw new Error(`setting the player origin: ${saved.status}`);
	}

	return {
		kind,
		api,
		root,
		direct,
		violations,
		signIn,
		appKey,
		cookie,
		mock: mockAt,
		engine: info?.engine,
		stop: () => {
			for (const c of [mock, proxy]) {
				c?.kill();
				if (c) children.delete(c);
			}
		},
	};
}

// The proxy answers before it appends to its report, so reading waits a moment for the last exchange.
export async function violationLines(t: Target): Promise<string[]> {
	await new Promise((r) => setTimeout(r, 250));
	return existsSync(t.violations)
		? readFileSync(t.violations, "utf8").split("\n").filter(Boolean)
		: [];
}
