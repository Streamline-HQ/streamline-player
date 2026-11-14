<script lang="ts">
let {
	usedPct,
	otherPct,
	labels,
}: { usedPct: number; otherPct: number; labels: [string, string, string] } = $props();
</script>

<div class="card">
	<div class="meter" role="img" aria-label={labels.join(", ")}>
		<b class="used" style:width="{usedPct}%"></b>
		<b class="other" style:width="{otherPct}%"></b>
	</div>
	<div class="legend">
		<span class="me">{labels[0]}</span>
		<span>{labels[1]}</span>
		<span class="free">{labels[2]}</span>
	</div>
</div>

<style>
.card {
	box-sizing: border-box;
	max-width: 440px;
	padding: 14px 16px;
	border: 1px solid var(--border);
	border-radius: var(--radius-lg);
	background: var(--bg-elevated);
}

.meter {
	display: flex;
	height: 8px;
	overflow: hidden;
	border-radius: 4px;
	background: var(--progress-track);
}

b {
	display: block;
	height: 100%;
}

.used {
	background: var(--player-accent);
}

.other {
	background: color-mix(in srgb, var(--fg) 22%, transparent);
}

.legend {
	display: flex;
	gap: 16px;
	margin-top: 8px;
	font: 400 11.5px var(--font-mono);
	color: var(--fg-subtle);
}

.me {
	color: var(--accent-text);
}

.free {
	margin-left: auto;
}
</style>
