import { flushSync, untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";

/** Indexes [from, to) of the items in rows `stride` px apart that meet a viewport `height` px tall, the list's top `top` px below the viewport's, plus `margin` rows each side. */
export function viewRange(
	top: number,
	height: number,
	stride: number,
	cols: number,
	total: number,
	margin: number,
) {
	if (stride <= 0) return { from: 0, to: Math.min(total, cols) };
	const first = Math.max(0, Math.floor(-top / stride) - margin);
	const last = Math.max(first, Math.ceil((height - top) / stride) + margin);
	return { from: Math.min(total, first * cols), to: Math.min(total, last * cols) };
}

export type Step = { urgent: boolean } & ({ draw: number } | { real: number[] });

/**
 * The next work on a list whose first `drawn` items are drawn, as skeletons or `real(i)`: skeletons
 * down to the end of `view`, then its skeletons made real, then skeletons for every item, then the
 * rest made real from `cursor`, below which every drawn item is real. `urgent` until every item is
 * drawn, so that the list is as tall as it will be and find-in-page sees every title, and while the
 * viewport shows skeletons. Draws at most `draws`, makes at most `reals` real.
 */
export function nextStep(
	real: (i: number) => boolean,
	total: number,
	drawn: number,
	view: { from: number; to: number },
	cursor: number,
	draws: number,
	reals: number,
): Step | null {
	if (drawn < view.to) return { urgent: true, draw: Math.min(view.to - drawn, draws) };
	const inView = pick(real, view.from, view.to, reals);
	if (inView.length) return { urgent: true, real: inView };
	if (drawn < total) return { urgent: true, draw: Math.min(total - drawn, draws) };
	const rest = pick(real, cursor, total, reals);
	return rest.length ? { urgent: false, real: rest } : null;
}

function pick(real: (i: number) => boolean, from: number, to: number, max: number) {
	const picked: number[] = [];
	for (let i = from; i < to && picked.length < max; i++) if (!real(i)) picked.push(i);
	return picked;
}

/** Height of the rows of `total` items not drawn yet, `drawn` drawn in rows of `cols`. */
export const restHeight = (total: number, drawn: number, cols: number, stride: number) =>
	(Math.ceil(total / cols) - Math.ceil(Math.min(drawn, total) / cols)) * stride;

/** How many items fit in `budget` ms at `each` ms apiece; `first` while that is unmeasured. */
export const fits = (budget: number, each: number, first: number) =>
	each > 0 ? Math.max(1, Math.floor(budget / each)) : first;

const BUDGET_MS = 8;
// For what must not wait several frames at 8 ms a frame: see `nextStep`.
const URGENT_BUDGET_MS = 24;
const MARGIN_ROWS = 1;
// Before their cost is measured: 700 skeletons take ~50 ms, so this many stay well inside a frame.
const FIRST_DRAW = 240;

// One chunk per frame. Chromium runs back-to-back `scheduler.yield` or MessageChannel tasks ahead of
// rendering, drawing a frame only every ~120 ms while the list mounts; WebKitGTK, the desktop
// webview, has neither `scheduler.yield` nor `requestIdleCallback`.
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Draws a long list a little at a time: skeletons, the same size as the items, then the real items.
 * Each frame does what the viewport needs first, wherever it has scrolled to, then the rest from
 * the top, within a time budget. The list element, given to `track`, lays out `items()` in rows of
 * equal height (a CSS grid, or one per line), draws the first `drawn` of them, real where
 * `real(id)`, and is padded by `after` px, the rows not drawn yet, so that its height and a restored
 * scroll position hold. A new `key()` starts over; a refresh, a filter or a sort keeps what is real.
 *
 * Apply `after` as `padding-bottom` itself, not through a custom property: custom properties
 * inherit, so every drawn item would be restyled on each step.
 */
export function progressive(items: () => { id: number }[], key: () => unknown) {
	const real = new SvelteSet<number>();
	const geo = $state({ cols: 1, stride: 0 });
	let drawn = $state(Math.min(items().length, 1));
	const restart = $derived(key());
	let node: HTMLElement | undefined;
	let run = 0;
	let pumping = false;

	function measure(el: HTMLElement) {
		const style = getComputedStyle(el);
		const tracks = style.gridTemplateColumns;
		const row = el.firstElementChild?.getBoundingClientRect().height ?? 0;
		geo.cols = tracks === "none" ? 1 : tracks.split(" ").length;
		geo.stride = row > 0 ? row + (Number.parseFloat(style.rowGap) || 0) : 0;
		return el.getBoundingClientRect().top;
	}

	async function pump() {
		const id = ++run;
		pumping = true;
		const cost = { draw: 0, real: 0 };
		let cursor = 0;
		let seen = items();
		let more = true;
		while (more) {
			await nextFrame();
			if (id !== run || !node) break;
			const list = items();
			if (list !== seen) {
				seen = list;
				cursor = 0;
			}
			const start = performance.now();
			const view = viewRange(
				measure(node),
				window.innerHeight,
				geo.stride,
				geo.cols,
				list.length,
				MARGIN_ROWS,
			);
			const isReal = (i: number) => i < drawn && real.has(list[i]?.id ?? -1);
			while (true) {
				const next = nextStep(isReal, list.length, drawn, view, cursor, 1, 1);
				if (!next) {
					more = false;
					break;
				}
				const left = (next.urgent ? URGENT_BUDGET_MS : BUDGET_MS) - (performance.now() - start);
				if (left <= 0) break;
				const step = nextStep(
					isReal,
					list.length,
					drawn,
					view,
					cursor,
					fits(left, cost.draw, FIRST_DRAW),
					fits(left, cost.real, geo.cols),
				);
				if (!step) break;
				const at = performance.now();
				if ("draw" in step) drawn += step.draw;
				else for (const i of step.real) real.add(list[i]?.id ?? -1);
				flushSync();
				// Reads layout, so the cost per item includes it.
				node.getBoundingClientRect();
				const each = (performance.now() - at) / ("draw" in step ? step.draw : step.real.length);
				if ("draw" in step) cost.draw = each;
				else {
					cost.real = each;
					if (!step.urgent) cursor = (step.real.at(-1) ?? cursor) + 1;
				}
			}
		}
		if (id === run) pumping = false;
	}

	let shownFor: unknown = {};
	$effect(() => {
		const list = restart;
		const count = items().length;
		untrack(() => {
			if (list !== shownFor) {
				shownFor = list;
				real.clear();
				drawn = Math.min(count, 1);
				pump();
			} else if (!pumping && count > 0) pump();
		});
	});
	$effect(() => () => {
		run++;
	});

	return {
		get drawn() {
			return drawn;
		},
		real: (id: number) => real.has(id),
		get after() {
			return restHeight(items().length, drawn, geo.cols, geo.stride);
		},
		track: (el: HTMLElement) => {
			node = el;
			measure(el);
			return {
				destroy: () => {
					if (node === el) node = undefined;
				},
			};
		},
	};
}
