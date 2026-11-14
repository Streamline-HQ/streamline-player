// The activity feed and its read state, through the contract proxy.
import { spawn } from "node:child_process";
import { strictEqual as eq, ok } from "node:assert";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActivityEvent } from "../../src/lib/core/types.ts";

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

type ApiError = { error: { code: string } };

const children: ReturnType<typeof spawn>[] = [];
const dir = mkdtempSync(join(tmpdir(), "activity-check-"));

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
	return { api: `${root}/api/v1`, report };
}

const violations = (report: string) =>
	existsSync(report) ? readFileSync(report, "utf8").split("\n").filter(Boolean) : [];
const JSON_HEADERS = { "Content-Type": "application/json" };
const feed = async (api: string) => {
	const r = await fetch(`${api}/activity`);
	eq(r.status, 200);
	return ((await r.json()) as { items: ActivityEvent[] }).items;
};
const read = (api: string, body: unknown) =>
	fetch(`${api}/activity/read`, {
		method: "POST",
		headers: JSON_HEADERS,
		body: JSON.stringify(body),
	});

try {
	const demo = await start("demo", "--demo-activity");
	const items = await feed(demo.api);
	eq(items.length, 11);
	eq(items[0].id, "a1");
	for (let i = 1; i < items.length; i++)
		ok(items[i - 1].at > items[i].at, `${items[i].id} is older`);
	eq(
		items
			.filter((e) => !e.read)
			.map((e) => e.id)
			.join(),
		"a1,a2,a3",
	);

	eq((await read(demo.api, { ids: ["a1", "nope"] })).status, 204);
	eq((await feed(demo.api)).filter((e) => !e.read).length, 2);
	eq(violations(demo.report).length, 0, violations(demo.report).join("\n"));

	// The proxy rightly reports these requests as breaking the contract, so they go to a mock of their own.
	const bad = await start("bad");
	for (const body of [{}, { ids: [] }]) {
		const r = await read(bad.api, body);
		eq(r.status, 400);
		eq(((await r.json()) as ApiError).error.code, "invalid_request");
	}

	const plain = await start("plain");
	const derived = await feed(plain.api);
	ok(derived.length > 0);
	for (const e of derived) {
		eq(e.read, true);
		ok(e.kind === "movie" || e.kind === "season", e.kind);
	}
	eq(violations(plain.report).length, 0, violations(plain.report).join("\n"));

	const empty = await start("empty", "--empty");
	eq((await feed(empty.api)).length, 0);
	eq(violations(empty.report).length, 0, violations(empty.report).join("\n"));

	const lean = await start("lean", "--demo-activity=no-downloads");
	const leanItems = await feed(lean.api);
	eq(leanItems.length, 10);
	ok(leanItems.every((e) => e.kind !== "download"));
	eq(violations(lean.report).length, 0, violations(lean.report).join("\n"));

	console.log("activity-check: ok");
} finally {
	for (const c of children) c.kill();
}
