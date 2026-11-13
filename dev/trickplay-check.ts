// node dev/trickplay-check.ts
import { deepStrictEqual as same, strictEqual as eq } from "node:assert";
import { parseTrickplay, tileAt } from "../src/lib/core/trickplay.ts";

const index = {
	interval: 10,
	tile_width: 320,
	tile_height: 180,
	cols: 10,
	rows: 10,
	count: 120,
	sheets: ["sheet_000.jpg", "sheet_001.jpg"],
};
const url = "http://e:8097/media/ab/trickplay.json?exp=1&sig=2";

const tp = parseTrickplay(url, JSON.stringify(index));
if (!tp) throw new Error("index did not parse");
eq(tp.sheets[0], "http://e:8097/media/ab/sheet_000.jpg?exp=1&sig=2");
eq(tp.sheets[1], "http://e:8097/media/ab/sheet_001.jpg?exp=1&sig=2");
eq(tp.tileWidth, 320);
eq(tp.count, 120);

eq(parseTrickplay(url, "{nope"), null);
eq(parseTrickplay(url, JSON.stringify({ ...index, interval: 0 })), null);
eq(parseTrickplay(url, JSON.stringify({ ...index, sheets: [] })), null);
eq(parseTrickplay(url, "null"), null);

same(tileAt(tp, 0), { sheet: tp.sheets[0], x: 0, y: 0, w: 320, h: 180 });
same(tileAt(tp, 119), { sheet: tp.sheets[0], x: 320, y: 180, w: 320, h: 180 });
same(tileAt(tp, 1000), { sheet: tp.sheets[1], x: 0, y: 0, w: 320, h: 180 });
same(tileAt(tp, 99999), { sheet: tp.sheets[1], x: 2880, y: 180, w: 320, h: 180 });
same(tileAt(tp, -5), tileAt(tp, 0));
console.log("trickplay-check ok");
