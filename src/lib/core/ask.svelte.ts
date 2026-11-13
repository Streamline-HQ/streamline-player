import { toast } from "#lib/core/toast.svelte.ts";

export type AskSpec = {
	title: string;
	body: string;
	input?: { label: string; placeholder: string; presets: string[] };
	confirm: string;
	onconfirm: (message: string) => void;
};

export type CountdownSpec = {
	title: string;
	seconds: number;
	note: string;
	ondone: () => void;
	onabort?: () => void;
	abortToast?: string;
};

type Timer = ReturnType<typeof setTimeout>;
type Timers = {
	set: (fn: () => void, ms: number) => Timer;
	clear: (id: Timer | undefined) => void;
};

export const MESSAGE_MAX = 200;
const TICK_MS = 1000;

// Wrapped by hand: a browser's setTimeout throws "Illegal invocation" when called as a method of this object.
const REAL: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };

export const asking = $state<{ spec: AskSpec | null }>({ spec: null });
export const counting = $state<{ spec: CountdownSpec | null; left: number }>({
	spec: null,
	left: 0,
});

let timers = REAL;
let ticker: Timer | undefined;
let epoch = 0;

export function ask(spec: AskSpec) {
	asking.spec = spec;
}

export function closeAsk() {
	asking.spec = null;
}

export function confirmAsk(message: string) {
	const spec = asking.spec;
	if (!spec) return;
	asking.spec = null;
	spec.onconfirm(message.trim().slice(0, MESSAGE_MAX));
}

export function countdown(spec: CountdownSpec, use: Timers = REAL) {
	timers.clear(ticker);
	timers = use;
	const mine = ++epoch;
	counting.spec = spec;
	counting.left = spec.seconds;
	const tick = () => {
		ticker = timers.set(() => {
			if (mine !== epoch) return;
			if (counting.left <= 1) finishCountdown(true);
			else {
				counting.left--;
				tick();
			}
		}, TICK_MS);
	};
	tick();
}

export function finishCountdown(run: boolean) {
	const spec = counting.spec;
	epoch++;
	timers.clear(ticker);
	counting.spec = null;
	if (!spec) return;
	if (run) spec.ondone();
	else {
		spec.onabort?.();
		if (spec.abortToast) toast(spec.abortToast);
	}
}
