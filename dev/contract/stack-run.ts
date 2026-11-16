// Boots the stack (`task dev:stack`), runs each given check against it with CONTRACT_TARGET=stack, and tears it down.
//   node dev/contract/stack-run.ts dev/contract/admin-check.ts ...
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const checks = process.argv.slice(2);
if (checks.length === 0) {
	console.error("usage: stack-run.ts <check.ts>...");
	process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), "contract-stack-"));
// Poster files the browse check asks the stack for, laid out as the extension serves them: <kind>/<id>/<file>.
const art = join(dir, "art");
mkdirSync(join(art, "movies", "1"), { recursive: true });
writeFileSync(
	join(art, "movies", "1", "poster.jpg"),
	Buffer.concat([Buffer.from("ffd8ffe0", "hex"), Buffer.alloc(1020)]),
);

const stack = spawn("task", ["dev:stack", "--", "--art", art], {
	stdio: ["ignore", "pipe", "inherit"],
	detached: true,
});
const stopStack = () => {
	try {
		if (stack.pid) process.kill(-stack.pid, "SIGINT");
	} catch {}
};
process.on("SIGINT", () => {
	stopStack();
	process.exit(130);
});

const failed: string[] = [];
try {
	const info = await new Promise<string>((resolve, reject) => {
		stack.once("exit", (code) =>
			reject(new Error(`the stack exited with ${code} before it was up`)),
		);
		let seen = "";
		stack.stdout?.on("data", (chunk) => {
			seen += String(chunk);
			const line = seen.split("\n").find((l) => l.startsWith('{"admin"'));
			if (line) resolve(line);
		});
	});
	const infoFile = join(dir, "stack.json");
	writeFileSync(infoFile, info);
	const env = { ...process.env, CONTRACT_TARGET: "stack", STACK_INFO: infoFile, CONTRACT_ART: "1" };
	for (const check of checks) {
		const run = spawnSync(process.execPath, [check], { env, stdio: "inherit" });
		if (run.status !== 0) failed.push(check);
	}
} finally {
	stopStack();
	rmSync(dir, { recursive: true, force: true });
}

if (failed.length > 0) {
	console.error(`failed against the stack: ${failed.join(", ")}`);
	process.exit(1);
}
console.log(`${checks.length} checks passed against the stack`);
