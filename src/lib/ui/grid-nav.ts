type Step = [number, number];
const STEPS: Record<string, Step> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};

/** The nearest item in a direction: distance along it, plus twice the distance across. */
function nearest(items: HTMLElement[], from: HTMLElement, [sx, sy]: Step) {
	const r = from.getBoundingClientRect();
	const cx = r.left + r.width / 2;
	const cy = r.top + r.height / 2;
	let best: HTMLElement | undefined;
	let bestD = Number.POSITIVE_INFINITY;
	for (const el of items) {
		if (el === from) continue;
		const b = el.getBoundingClientRect();
		const dx = b.left + b.width / 2 - cx;
		const dy = b.top + b.height / 2 - cy;
		const along = sx ? dx * sx : dy * sy;
		if (along <= 4) continue;
		const d = along + (sx ? Math.abs(dy) : Math.abs(dx)) * 2;
		if (d < bestD) {
			bestD = d;
			best = el;
		}
	}
	return best;
}

/**
 * Arrow keys and Tab between a screen's `[data-nav]` items, starting from a text field:
 * ArrowDown leaves the field, Escape or ArrowUp from the top row returns to it, Tab wraps.
 */
export function gridNav(root: () => HTMLElement | undefined, field: () => HTMLElement | undefined) {
	return (e: KeyboardEvent) => {
		const box = root();
		const input = field();
		if (!box || !input) return;
		const items = [...box.querySelectorAll<HTMLElement>("[data-nav]")];
		const cur = document.activeElement as HTMLElement | null;
		const i = cur ? items.indexOf(cur) : -1;
		if (!items.length || !cur || (i < 0 && cur !== input)) return;
		const go = (el: HTMLElement | undefined) => {
			if (!el) return;
			e.preventDefault();
			el.focus();
			el.scrollIntoView({ block: "nearest", behavior: "smooth" });
		};
		if (cur === input) {
			if (e.key === "ArrowDown") go(items[0]);
			return;
		}
		if (e.key === "Escape") return go(input);
		if (e.key === "Tab")
			return go(items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length]);
		const step = STEPS[e.key];
		if (!step) return;
		const best = nearest(items, cur, step);
		if (best) go(best);
		else if (step[1] < 0) go(input);
		else go(items[(i + (step[0] || step[1]) + items.length) % items.length]);
	};
}
