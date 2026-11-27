import type { UserConfig } from "vite";

type PostcssPlugin = Extract<
	NonNullable<
		Exclude<NonNullable<NonNullable<UserConfig["css"]>["postcss"]>, string>["plugins"]
	>[number],
	{ postcssPlugin: string }
>;

const SVELTE_WHERE = /:where\((\.svelte-[a-z0-9]+)\)/g;
const RATIO = /^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/;
const REPLACED = /\b(img|video)\b[^\s>+~]*$/;

/**
 * Fallbacks for webOS 22's Chromium 87, each in an `@supports not (…)` block right after its rule,
 * so an engine that has the feature never sees them. Not as duplicate declarations: the minifier
 * merges those and keeps only the last.
 * - Svelte 5 scopes a descendant as `x:where(.svelte-h)`; `:where()` is Chromium 88, and an unknown
 *   selector drops the whole rule. The copy has `.svelte-h` bare: Svelte 4's specificity.
 * - `aspect-ratio` (88): a fixed `width` gets its `height`, anything else the padding-top float
 *   (an `img`/`video` keeps its own ratio, a grid would take the pseudo-elements as items).
 * - `overflow: clip` (90) → `hidden`; `scrollbar-width: none` (121) → `::-webkit-scrollbar`.
 */
export const chromium87: PostcssPlugin = {
	postcssPlugin: "chromium87",
	OnceExit(root, { AtRule, Rule }) {
		const rules: (typeof Rule.prototype)[] = [];
		root.walkRules((rule) => {
			if (!(rule.parent?.type === "atrule" && /keyframes/.test(String(rule.parent.name))))
				rules.push(rule);
		});
		for (const rule of rules) {
			const selectors = rule.selectors.map((s) => s.replace(SVELTE_WHERE, "$1"));
			const selector = selectors.join(",");
			const pseudo = (p: string) => selectors.map((s) => s + p).join(",");
			const blocks: (typeof AtRule.prototype)[] = [];
			const block = (cond: string, ...nodes: (typeof Rule.prototype)[]) =>
				blocks.push(new AtRule({ name: "supports", params: `not ${cond}`, nodes }));
			if (selector !== rule.selector)
				block("selector(:where(a))", rule.clone({ selector }) as typeof Rule.prototype);
			const decl = (prop: string) => rule.nodes.find((n) => n.type === "decl" && n.prop === prop);
			const value = (prop: string) => {
				const d = decl(prop);
				return d?.type === "decl" ? d.value.trim() : undefined;
			};
			const ratio = RATIO.exec(value("aspect-ratio") ?? "");
			if (ratio) {
				const [w, h] = [Number(ratio[1]), Number(ratio[2])];
				const width = /^([\d.]+)px$/.exec(value("width") ?? "");
				if (width)
					block(
						"(aspect-ratio: 1)",
						new Rule({ selector, nodes: [] }).append({
							prop: "height",
							value: `${+((Number(width[1]) * h) / w).toFixed(2)}px`,
						}),
					);
				else if (!value("display")?.includes("grid") && !selectors.some((s) => REPLACED.test(s)))
					block(
						"(aspect-ratio: 1)",
						new Rule({ selector: pseudo("::before") }).append(
							{ prop: "content", value: '""' },
							{ prop: "float", value: "left" },
							{ prop: "padding-top", value: `${+((h / w) * 100).toFixed(4)}%` },
						),
						new Rule({ selector: pseudo("::after") }).append(
							{ prop: "content", value: '""' },
							{ prop: "display", value: "block" },
							{ prop: "clear", value: "both" },
						),
					);
			}
			for (const prop of ["overflow", "overflow-x", "overflow-y"])
				if (value(prop) === "clip")
					block("(overflow: clip)", new Rule({ selector }).append({ prop, value: "hidden" }));
			if (value("scrollbar-width") === "none")
				block(
					"(scrollbar-width: none)",
					new Rule({ selector: pseudo("::-webkit-scrollbar") }).append({
						prop: "display",
						value: "none",
					}),
				);
			// Vite rewrites url()s relative to each declaration's source file.
			for (const b of blocks) {
				b.source = rule.source;
				b.walk((n) => {
					n.source ??= rule.source;
				});
			}
			rule.after(blocks);
		}
	},
};
