// node dev/auto-check.ts
import { strictEqual as eq } from "node:assert";
import { autoCap, capped, stepDown } from "../src/lib/core/playback/auto.ts";

const M = 1_000_000;

// 0.8 of the measured speed, 1.15x the file to play the original, otherwise the first preset that fits.
eq(autoCap(null, 60, true), null);
eq(autoCap(null, null, true), null);
eq(autoCap(100 * M, 60, true), null);
eq(autoCap(80 * M, 60, true), 20);
eq(autoCap(8 * M, 60, true), 4);
eq(autoCap(0.5 * M, 60, true), 1);
eq(autoCap(null, 60, false), 20);
eq(autoCap(100 * M, 2, false), 20);
eq(autoCap(8 * M, null, true), 4);

// A mobile-data limit holds Auto down, the original included, and never raises it.
eq(capped(null, null), null);
eq(capped(20, null), 20);
eq(capped(null, 8), 8);
eq(capped(20, 8), 8);
eq(capped(2, 8), 2);

// Measured: follows the link, stays when the link holds the stream.
eq(stepDown(8 * M, 60, true), 4);
eq(stepDown(8 * M, 20, false), 4);
eq(stepDown(100 * M, 20, false), null);
eq(stepDown(5 * M, 4, false), null);
eq(stepDown(0.5 * M, 8, false), 1);
eq(stepDown(0.5 * M, 1, false), null);

// No reading from this stall: guessing steps one preset, otherwise it waits.
eq(stepDown(null, 60, true), 20);
eq(stepDown(null, 8, true), 4);
eq(stepDown(null, Infinity, true), 20);
eq(stepDown(null, 20, false), null);
eq(stepDown(null, 1, true), null);
