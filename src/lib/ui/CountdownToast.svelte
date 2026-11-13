<script lang="ts">
import Button from "#lib/ui/Button.svelte";
import Icon from "#lib/ui/Icon.svelte";
import "#lib/ui/ui.css";

let {
	title,
	line,
	total,
	nowLabel,
	abortLabel,
	onnow,
	onabort,
}: {
	title: string;
	line: string;
	total: number;
	nowLabel: string;
	abortLabel: string;
	onnow: () => void;
	onabort: () => void;
} = $props();

let run = $state(false);

$effect(() => {
	void total;
	void title;
	run = false;
	let second = 0;
	const first = requestAnimationFrame(() => {
		second = requestAnimationFrame(() => (run = true));
	});
	return () => {
		cancelAnimationFrame(first);
		cancelAnimationFrame(second);
	};
});
</script>

<div class="sl-cdtoast" role="status" aria-live="polite" style:--c="var(--status-warning)">
	<div class="sl-cdtoast__row">
		<Icon name="rotate-cw" />
		<span class="sl-cdtoast__text">
			<span class="sl-cdtoast__title">{title}</span>
			<span class="sl-cdtoast__sub">{line}</span>
		</span>
		<Button variant="ghost" size="sm" onclick={onnow}>{nowLabel}</Button>
		<Button variant="primary" size="sm" onclick={onabort}>{abortLabel}</Button>
	</div>
	<div class="sl-cdtoast__bar">
		<b
			style:width={run ? "0%" : "100%"}
			style:transition={run ? `width ${total}s linear` : "none"}
		></b>
	</div>
</div>
