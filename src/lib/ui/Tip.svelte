<script lang="ts" module>
const DELAY_MS = 350;
const GAP = 10;
const EDGE = 8;
let bubble: HTMLElement | undefined;

// One bubble on the body for the whole app: an ancestor that clips or scales its content
// (a row that scrolls, a card that grows on hover) would cut or shift a bubble drawn inside it.
function show(host: HTMLElement, text: string, key?: string, below = false) {
	if (!text) return;
	if (!bubble) {
		bubble = document.createElement("div");
		bubble.className = "sl-tip";
		bubble.setAttribute("aria-hidden", "true");
		document.body.append(bubble);
	}
	bubble.textContent = text;
	if (key) {
		const cap = document.createElement("span");
		cap.className = "sl-tip__key";
		cap.textContent = key;
		bubble.append(cap);
	}
	const at = host.getBoundingClientRect();
	const size = bubble.getBoundingClientRect();
	const left = Math.min(
		Math.max(EDGE, at.left + at.width / 2 - size.width / 2),
		innerWidth - size.width - EDGE,
	);
	const above = at.top - GAP - size.height;
	bubble.style.left = `${Math.round(left)}px`;
	bubble.style.top = `${Math.round(above >= EDGE && !below ? above : at.bottom + GAP)}px`;
	bubble.classList.add("sl-tip--on");
}

const hide = () => bubble?.classList.remove("sl-tip--on");
</script>

<script lang="ts">
import "#lib/ui/ui.css";

/** A label for the element this sits in, shown above it (or `below`) on hover or keyboard focus. */
let { text, key, below = false }: { text?: string; key?: string; below?: boolean } = $props();
let anchor = $state<HTMLElement>();

$effect(() => {
	const host = anchor?.parentElement;
	if (!host) return;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const open = () => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			// A control whose own panel is open says enough already.
			if (host.classList.contains("on") || host.getAttribute("aria-expanded") === "true") return;
			if (text) show(host, text, key, below);
		}, DELAY_MS);
	};
	const close = () => {
		clearTimeout(timer);
		hide();
	};
	const focus = () => host.matches(":focus-visible") && open();
	host.addEventListener("mouseenter", open);
	host.addEventListener("mouseleave", close);
	host.addEventListener("mousedown", close);
	host.addEventListener("focus", focus);
	host.addEventListener("blur", close);
	return () => {
		close();
		host.removeEventListener("mouseenter", open);
		host.removeEventListener("mouseleave", close);
		host.removeEventListener("mousedown", close);
		host.removeEventListener("focus", focus);
		host.removeEventListener("blur", close);
	};
});
</script>

<span bind:this={anchor} hidden></span>
