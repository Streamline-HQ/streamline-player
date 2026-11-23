// What the app and SvelteKit's runtime call that webOS 22's Chromium 87 lacks. A classic script
// loaded before the modules, so it is in place before any of them runs. Drop a line once the
// oldest supported engine has it natively.
(() => {
	const define = (target, name, value) => {
		if (!(name in target))
			Object.defineProperty(target, name, { value, writable: true, configurable: true });
	};
	const at = function (index) {
		const i = Math.trunc(index) || 0;
		return this[i < 0 ? this.length + i : i];
	};
	define(Array.prototype, "at", at);
	define(String.prototype, "at", at);
	define(Array.prototype, "findLast", function (test, self) {
		for (let i = this.length - 1; i >= 0; i--) if (test.call(self, this[i], i, this)) return this[i];
	});
	define(Object, "hasOwn", (object, key) => Object.prototype.hasOwnProperty.call(object, key));
	define(URL, "canParse", (url, base) => {
		try {
			new URL(url, base);
			return true;
		} catch {
			return false;
		}
	});
})();
