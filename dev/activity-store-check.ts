// node --import ./dev/controller-check/register.mjs dev/activity-store-check.ts
import { strictEqual as eq, deepStrictEqual as same } from "node:assert";
import { must } from "./must.ts";

const { feed, loadActivity, markAllRead, markRead, resetActivity, unread } = await import(
	"../src/lib/core/activity.svelte.ts"
);

const ev = (id: string, read: boolean) => ({
	id,
	kind: "scan",
	at: "2026-11-09T12:00:00Z",
	read,
});
const fresh = () => [ev("a1", false), ev("a2", false), ev("a3", true)];

function port() {
	const p = {
		loads: 0,
		sent: [] as string[][],
		failLoad: false,
		failRead: false,
		async activity() {
			p.loads++;
			if (p.failLoad) throw new Error("down");
			return fresh();
		},
		async markActivityRead(ids: string[]) {
			p.sent.push(ids);
			if (p.failRead) throw new Error("down");
		},
	};
	return p;
}

let p = port();
await loadActivity(p);
await loadActivity(p);
eq(p.loads, 1);
await loadActivity(p, true);
eq(p.loads, 2);
eq(feed.loaded, true);
eq(unread(), 2);

const concurrent = port();
resetActivity();
await Promise.all([loadActivity(concurrent), loadActivity(concurrent, true)]);
eq(concurrent.loads, 1);

p.failLoad = true;
must(feed.items[0]).read = true;
await loadActivity(p, true);
eq(typeof feed.error, "string");
eq(feed.items.length, 3);
eq(unread(), 1);

p = port();
resetActivity();
await loadActivity(p);
const pending = markRead(p, ["a1"]);
eq(must(feed.items[0]).read, true);
eq(unread(), 1);
eq(await pending, true);
same(p.sent, [["a1"]]);

eq(await markRead(p, ["a1", "a3"]), true);
same(p.sent, [["a1"]]);

p.failRead = true;
eq(await markRead(p, ["a2"]), false);
eq(must(feed.items[1]).read, false);
eq(must(feed.items[0]).read, true);
eq(must(feed.items[2]).read, true);
eq(unread(), 1);

p = port();
resetActivity();
await loadActivity(p);
eq(await markAllRead(p), true);
same(p.sent, [["a1", "a2"]]);
eq(unread(), 0);
eq(await markAllRead(p), true);
eq(p.sent.length, 1);

resetActivity();
same(feed.items, []);
eq(feed.loaded, false);

console.log("activity-store-check: ok");
