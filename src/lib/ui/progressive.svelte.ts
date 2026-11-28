import { flushSync, untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";

/** Height of the rows of `total` items not drawn yet, `drawn` drawn in rows of `cols`. */
export const restHeight = (total: number, drawn: number, cols: number, stride: number) =>
	(Math.ceil(total / cols) - Math.ceil(Math.min(drawn, total) / cols)) * stride;

/** How many items fit in `budget` ms at `each` ms apiece; `first` while that is unmeasured. */
export const fits = (budget: number, each: number, first: number) =>
	each > 0 ? Math.max(1, Math.floor(budget / each)) : first;

// Each frame's share of work, as a part of the frame: 8 ms of a 60 Hz frame, 3 ms at 165 Hz.
const FRAME_SHARE = 0.5;
// How far around the viewport items are real, in viewport heights each side: ahead of the scroll,
// so that skeletons seldom reach the viewport.
const NEAR = "150%";
// Real items cost the webview on every frame it draws, on screen or not (WebKitGTK walks the
// layers of the whole page), so those further than this go back to skeletons. Far wider than
// NEAR: a scroll back finds its cards still there.
const KEEP = "4000%";
// Before their cost is measured: 700 skeletons take ~50 ms, so this many stay well inside a frame.
const FIRST_DRAW = 240;
const FIRST_REAL = 2;

// One chunk per frame. Chromium runs back-to-back `scheduler.yield` or MessageChannel tasks ahead of
// rendering, drawing a frame only every ~120 ms while the list mounts; WebKitGTK, the desktop
// webview, has neither `scheduler.yield` nor `requestIdleCallback`.
// The display's frame, as the shortest gap between two frames seen so far: our own work stretches
// the others. Kept across lists and bursts of work, so that a burst does not start on a 60 Hz guess.
// ponytail: only ever shrinks; a window moved to a slower screen keeps the smaller share.
let frame = 1000 / 60;

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

function scroller(el: HTMLElement) {
	for (let p = el.parentElement; p; p = p.parentElement) {
		const overflow = getComputedStyle(p).overflowY;
		if (overflow === "auto" || overflow === "scroll") return p;
	}
	return null;
}

/**
 * Draws a long list a little at a time: skeletons, the same size as the items, then the real items
 * around the viewport, wherever it scrolls to, within a share of each frame. The list element,
 * given to `track`, has `items()` as its only children, in order, in rows of equal height (a CSS
 * grid, or one per line), draws the first `drawn` of them, real where `real(id)`, and is padded by
 * `after` px, the rows not drawn yet, so that its height and a restored scroll position hold. A
 * new `key()` starts over; a refresh, a filter or a sort keeps what is real.
 *
 * The browser says which items are near the viewport (IntersectionObserver): asking it for
 * positions on each frame made it lay the whole list out again every time.
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
	// Near the viewport and not real yet, oldest first: under a scroll, those the viewport reaches first.
	const wanted = new Set<number>();

	// Only while skeletons are still being drawn, for `after`: it reads layout.
	function measure(el: HTMLElement) {
		const style = getComputedStyle(el);
		const tracks = style.gridTemplateColumns;
		const row = el.firstElementChild?.getBoundingClientRect().height ?? 0;
		geo.cols = tracks === "none" ? 1 : tracks.split(" ").length;
		geo.stride = row > 0 ? row + (Number.parseFloat(style.rowGap) || 0) : 0;
	}

	async function pump() {
		const id = ++run;
		pumping = true;
		const cost = { draw: 0, real: 0 };
		let last = 0;
		while (wanted.size > 0 || drawn < items().length) {
			const now = await nextFrame();
			if (id !== run || !node) break;
			if (last) frame = Math.min(frame, Math.max(4, now - last));
			last = now;
			const budget = frame * FRAME_SHARE;
			const start = performance.now();
			while (wanted.size > 0) {
				const left = budget - (performance.now() - start);
				if (left <= 0) break;
				const at = performance.now();
				let made = 0;
				for (const want of wanted) {
					wanted.delete(want);
					real.add(want);
					if (++made >= fits(left, cost.real, FIRST_REAL)) break;
				}
				flushSync();
				cost.real = (performance.now() - at) / made;
			}
			const total = items().length;
			const left = budget - (performance.now() - start);
			if (drawn < total && (left > 0 || wanted.size === 0)) {
				measure(node);
				const at = performance.now();
				const step = Math.min(total - drawn, fits(Math.max(left, 1), cost.draw, FIRST_DRAW));
				drawn += step;
				flushSync();
				cost.draw = (performance.now() - at) / step;
			}
		}
		if (id === run) pumping = false;
	}

	const idOf = (el: Element) =>
		node ? items()[Array.prototype.indexOf.call(node.children, el)]?.id : undefined;

	function watch(el: HTMLElement) {
		const root = scroller(el);
		const near = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					const item = idOf(e.target);
					if (item === undefined) continue;
					if (!e.isIntersecting) wanted.delete(item);
					else if (!real.has(item)) wanted.add(item);
				}
				if (wanted.size > 0 && !pumping) pump();
			},
			{ root, rootMargin: `${NEAR} 0px` },
		);
		const keep = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) continue;
					const item = idOf(e.target);
					if (item !== undefined) real.delete(item);
				}
			},
			{ root, rootMargin: `${KEEP} 0px` },
		);
		const see = (child: Node) => {
			if (!(child instanceof Element)) return;
			near.observe(child);
			keep.observe(child);
		};
		// A skeleton and its real item are different elements, and the list grows as it is drawn.
		const children = new MutationObserver((changes) => {
			for (const change of changes) {
				for (const gone of change.removedNodes) {
					if (!(gone instanceof Element)) continue;
					near.unobserve(gone);
					keep.unobserve(gone);
				}
				change.addedNodes.forEach(see);
			}
		});
		children.observe(el, { childList: true });
		for (const child of el.children) see(child);
		return () => {
			near.disconnect();
			keep.disconnect();
			children.disconnect();
		};
	}

	let shownFor: unknown = {};
	$effect(() => {
		const list = restart;
		const count = items().length;
		untrack(() => {
			if (list !== shownFor) {
				shownFor = list;
				real.clear();
				wanted.clear();
				drawn = Math.min(count, 1);
				pump();
			} else if (!pumping && count > drawn) pump();
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
			const unwatch = watch(el);
			return {
				destroy: () => {
					unwatch();
					if (node === el) node = undefined;
				},
			};
		},
	};
}
