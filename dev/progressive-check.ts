// node --import ./dev/controller-check/register.mjs dev/progressive-check.ts
import { strictEqual as eq } from "node:assert";

const { fits, restHeight } = await import("../src/lib/ui/progressive.svelte.ts");

eq(restHeight(700, 1, 6, 419.25), 116 * 419.25);
eq(restHeight(700, 700, 6, 419.25), 0);
eq(restHeight(700, 900, 6, 419.25), 0);
eq(restHeight(700, 1, 6, 0), 0);

eq(fits(8, 0, 6), 6);
eq(fits(8, 1.5, 6), 5);
eq(fits(24, 1.5, 6), 16);
eq(fits(8, 40, 6), 1);
