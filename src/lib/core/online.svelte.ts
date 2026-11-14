export const net: { online: boolean } = $state({ online: true });

const RETRY_MS = 5000;
const checks = new Set<() => void>();

/** A call the shell made failed on the network: ask again now instead of waiting for the next poll. */
export const reportUnreachable = () => {
	for (const check of checks) check();
};

/**
 * Whether the server answers: checked at start, when the window's connection events fire, when
 * `reportUnreachable` is called, and every 5 s while it does not.
 */
export function watchOnline(
	port: { reachable(): Promise<boolean> },
	onchange: (online: boolean) => void,
): () => void {
	let stopped = false;
	let busy = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const check = async () => {
		if (stopped || busy) return;
		busy = true;
		clearTimeout(timer);
		const up = await port.reachable().catch(() => false);
		busy = false;
		if (stopped) return;
		if (up !== net.online) {
			net.online = up;
			onchange(up);
		}
		if (!up) timer = setTimeout(check, RETRY_MS);
	};
	checks.add(check);
	const hasEvents = typeof globalThis.addEventListener === "function";
	if (hasEvents) {
		globalThis.addEventListener("online", check);
		globalThis.addEventListener("offline", check);
	}
	check();
	return () => {
		stopped = true;
		clearTimeout(timer);
		checks.delete(check);
		if (hasEvents) {
			globalThis.removeEventListener("online", check);
			globalThis.removeEventListener("offline", check);
		}
	};
}
