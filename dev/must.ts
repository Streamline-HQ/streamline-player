export function must<T>(value: T | null | undefined, what = "value"): T {
	if (value == null) throw new Error(`missing ${what}`);
	return value;
}
