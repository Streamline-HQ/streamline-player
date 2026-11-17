// node dev/reconcile-check.ts
import { strictEqual as eq, ok } from "node:assert";
import { equal, reconcile } from "../src/lib/core/reconcile.ts";

eq(equal({ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 }), true);
eq(equal({ a: 1 }, { a: 1, b: undefined }), false);
eq(equal({ a: undefined }, { b: undefined }), false);
eq(equal([1, 2], { 0: 1, 1: 2 }), false);
eq(equal([1, 2], [1, 2, 3]), false);
eq(equal({ a: { b: 1 } }, { a: { b: 2 } }), false);
eq(equal(null, {}), false);
eq(equal(null, null), true);

const row = (id: number, title: string, size = 1) => ({ id, title, file_summary: { size } });
const key = (t: { id: number }) => t.id;
const old = [row(1, "Alien"), row(2, "Brazil"), row(3, "Casablanca")];

eq(reconcile(old, [row(1, "Alien"), row(2, "Brazil"), row(3, "Casablanca")], key), old);

const changed = reconcile(old, [row(1, "Alien"), row(2, "Brazil", 9), row(3, "Casablanca")], key);
ok(changed !== old);
eq(changed[0], old[0]);
eq(changed[1]?.file_summary.size, 9);
eq(changed[2], old[2]);

const moved = reconcile(old, [row(3, "Casablanca"), row(1, "Alien")], key);
eq(moved.length, 2);
eq(moved[0], old[2]);
eq(moved[1], old[0]);

const added = reconcile(old, [...old.map((t) => ({ ...t })), row(4, "Dune")], key);
eq(added.length, 4);
eq(added[2], old[2]);
eq(added[3]?.title, "Dune");

eq(reconcile([], [], key).length, 0);
