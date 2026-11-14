// node --import ./dev/controller-check/register.mjs dev/downloads-store-check.ts
import { strictEqual as eq, deepStrictEqual as same } from "node:assert";
import { mock } from "node:test";
import type { DownloadEntry, DownloadsEvent } from "../src/lib/core/types.ts";

const {
	anyActive,
	dl,
	entry,
	initDownloads,
	refreshStorage,
	remove,
	resetDownloads,
	retry,
	start,
} = await import("../src/lib/core/downloads.svelte.ts");
const { net, reportUnreachable, watchOnline } = await import("../src/lib/core/online.svelte.ts");

const row = (key: string, state: DownloadEntry["state"]) =>
	({ key, state, progress: 0, bytes: 0, size: 1 }) as unknown as DownloadEntry;

function port(initial: DownloadEntry[]) {
	const p = {
		loads: 0,
		listeners: [] as ((e: DownloadsEvent) => void)[],
		calls: [] as unknown[][],
		async downloads() {
			p.loads++;
			return initial;
		},
		async onDownloads(cb: (e: DownloadsEvent) => void) {
			p.listeners.push(cb);
			return () => {
				p.listeners = p.listeners.filter((l) => l !== cb);
			};
		},
		async startDownloads(...a: unknown[]) {
			p.calls.push(["start", ...a]);
		},
		async removeDownloads(...a: unknown[]) {
			p.calls.push(["remove", ...a]);
		},
		async retryDownload(...a: unknown[]) {
			p.calls.push(["retry", ...a]);
		},
		async downloadStorage() {
			return { used: 1, other: 2, free: 3 };
		},
		emit(items: DownloadEntry[], rate = 0) {
			for (const l of p.listeners) l({ items, rate });
		},
	};
	return p;
}

const p = port([row("a", "done"), row("b", "downloading")]);
const done: string[] = [];
const stop = await initDownloads(p, (e) => done.push(e.key));
eq(p.loads, 1);
eq(dl.loaded, true);
eq(dl.items.length, 2);
eq(entry("b")?.state, "downloading");
eq(entry("zz"), undefined);
same(done, []);

p.emit([row("a", "done"), row("b", "done")], 2e6);
same(done, ["b"]);
eq(dl.rate, 2e6);
p.emit([row("a", "done"), row("b", "done"), row("c", "queued")]);
same(done, ["b"]);
p.emit([row("a", "done"), row("b", "done"), row("c", "done")]);
same(done, ["b", "c"]);

eq(anyActive(), false);
for (const s of ["queued", "preparing", "downloading", "waiting"] as const) {
	p.emit([row("a", "done"), row("x", s)]);
	eq(anyActive(), true, s);
}
p.emit([row("a", "done"), row("x", "failed")]);
eq(anyActive(), false);

await start(p, [{ key: "k" } as never], { caps: 1 });
await remove(p, ["a", "b"]);
await retry(p, "x");
same(p.calls, [
	["start", [{ key: "k" }], { caps: 1 }],
	["remove", ["a", "b"]],
	["retry", "x"],
]);

await refreshStorage(p);
same(dl.storage, { used: 1, other: 2, free: 3 });
stop();
eq(p.listeners.length, 0);

resetDownloads();
const late = port([row("a", "downloading")]);
await initDownloads(late, (e) => done.push(`late-${e.key}`));
late.emit([row("a", "done")]);
eq(done.at(-1), "late-a");

const handlers = new Map<string, () => void>();
Object.assign(globalThis, {
	addEventListener: (n: string, f: () => void) => handlers.set(n, f),
	removeEventListener: (n: string) => handlers.delete(n),
});
mock.timers.enable({ apis: ["setTimeout"] });
const flush = () => new Promise<void>((r) => setImmediate(r));
let up = false;
let asked = 0;
const changes: boolean[] = [];
const off = watchOnline(
	{
		reachable: async () => {
			asked++;
			return up;
		},
	},
	(o) => changes.push(o),
);
await flush();
same(changes, [false]);
eq(net.online, false);
eq(asked, 1);
mock.timers.tick(5000);
await flush();
eq(asked, 2);
same(changes, [false]);
up = true;
mock.timers.tick(5000);
await flush();
same(changes, [false, true]);
eq(net.online, true);
mock.timers.tick(20000);
await flush();
eq(asked, 3);

up = false;
reportUnreachable();
await flush();
same(changes, [false, true, false]);
eq(asked, 4);
up = true;
handlers.get("online")?.();
await flush();
same(changes, [false, true, false, true]);

off();
eq(handlers.size, 0);
reportUnreachable();
await flush();
eq(asked, 5);
console.log("downloads-store-check: ok");
