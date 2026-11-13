// node --import ./dev/controller-check/register.mjs dev/ask-check.ts
import { strictEqual as eq } from "node:assert";

const { ask, asking, confirmAsk, countdown, counting, finishCountdown } = await import(
	"../src/lib/core/ask.svelte.ts"
);
const { activeToast } = await import("../src/lib/core/toast.svelte.ts");

function clock() {
	let next = 0;
	const due = new Map<number, () => void>();
	return {
		set: (fn: () => void) => {
			due.set(++next, fn);
			return next as unknown as ReturnType<typeof setTimeout>;
		},
		clear: (id: ReturnType<typeof setTimeout> | undefined) =>
			void due.delete(id as unknown as number),
		tick() {
			const fns = [...due.values()];
			due.clear();
			for (const fn of fns) fn();
		},
		pending: () => due.size,
	};
}

function spec(over: Record<string, unknown> = {}) {
	const calls = { done: 0, abort: 0 };
	return {
		calls,
		spec: {
			title: "Restarting",
			seconds: 10,
			note: "3 streams will pause",
			ondone: () => calls.done++,
			onabort: () => calls.abort++,
			...over,
		},
	};
}

{
	const t = clock();
	const s = spec();
	countdown(s.spec, t);
	eq(counting.left, 10);
	for (let i = 1; i <= 9; i++) {
		t.tick();
		eq(s.calls.done, 0);
		eq(counting.left, 10 - i);
	}
	t.tick();
	eq(s.calls.done, 1);
	eq(counting.spec, null);
	eq(t.pending(), 0);
}

{
	const t = clock();
	const s = spec({ abortToast: "Restart aborted" });
	countdown(s.spec, t);
	for (let i = 0; i < 6; i++) t.tick();
	eq(counting.left, 4);
	finishCountdown(false);
	eq(s.calls.abort, 1);
	eq(s.calls.done, 0);
	eq(activeToast()?.title, "Restart aborted");
	t.tick();
	eq(s.calls.done, 0);
}

{
	const t = clock();
	const s = spec();
	countdown(s.spec, t);
	for (let i = 0; i < 6; i++) t.tick();
	finishCountdown(true);
	eq(s.calls.done, 1);
	t.tick();
	t.tick();
	eq(s.calls.done, 1);
	finishCountdown(true);
	eq(s.calls.done, 1);
}

{
	const t = clock();
	const first = spec();
	const second = spec({ seconds: 5 });
	countdown(first.spec, t);
	t.tick();
	countdown(second.spec, t);
	eq(counting.left, 5);
	eq(first.calls.done + first.calls.abort, 0);
	for (let i = 0; i < 5; i++) t.tick();
	eq(first.calls.done, 0);
	eq(second.calls.done, 1);
}

{
	const got: string[] = [];
	const q = (confirm: string) => ({
		title: "Stop",
		body: "",
		confirm,
		onconfirm: (m: string) => got.push(m),
	});
	ask(q("Stop"));
	confirmAsk("  hi  ");
	eq(asking.spec, null);
	ask(q("Stop"));
	confirmAsk("x".repeat(250));
	eq(got[0], "hi");
	eq(got[1]?.length, 200);
	confirmAsk("again");
	eq(got.length, 2);
}

console.log("ask-check: ok");
