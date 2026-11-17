/** Deep equality of JSON data, blind to key order. */
export function equal(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const ka = Object.keys(a);
	if (ka.length !== Object.keys(b).length) return false;
	return ka.every(
		(k) =>
			Object.hasOwn(b, k) &&
			equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
	);
}

/**
 * `next`, keeping each entry of `old` that is equal to its counterpart by `key`, and `old` itself when
 * nothing changed. Keyed `{#each}` blocks then leave the unchanged entries' components alone.
 */
export function reconcile<T, K>(old: T[], next: T[], key: (t: T) => K): T[] {
	const before = new Map(old.map((t) => [key(t), t]));
	const merged = next.map((t) => {
		const was = before.get(key(t));
		return was !== undefined && equal(was, t) ? was : t;
	});
	return merged.length === old.length && merged.every((t, i) => t === old[i]) ? old : merged;
}
