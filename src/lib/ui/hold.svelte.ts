const HOLD_MS = 450;

/** Phone: a long press turns a card's controls on; a tap elsewhere puts them away. */
export function hold(box: () => HTMLElement | undefined, enabled: () => boolean) {
	let held = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	// The click that ends the long press must not open the title.
	let swallow = false;
	const release = () => clearTimeout(timer);

	$effect(() => {
		if (!held) return;
		const away = (e: PointerEvent) => {
			if (box()?.contains(e.target as Node)) return;
			held = false;
			swallow = false;
		};
		document.addEventListener("pointerdown", away, true);
		return () => document.removeEventListener("pointerdown", away, true);
	});
	$effect(() => release);

	return {
		get held() {
			return held;
		},
		press() {
			clearTimeout(timer);
			if (held || !enabled()) return;
			timer = setTimeout(() => {
				swallow = true;
				held = true;
			}, HOLD_MS);
		},
		release,
		// A press that turns into a scroll ends without a click.
		cancel() {
			release();
			swallow = false;
		},
		tap(open: () => void) {
			if (swallow) swallow = false;
			else if (!held) open();
		},
	};
}
