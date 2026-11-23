// node dev/tv-keys-check.ts
import { strictEqual as eq } from "node:assert";
import { type TvKey, tvKey } from "../src/lib/tv/keys.ts";

const byCode = (keyCode: number, key = "Unidentified") => tvKey({ key, keyCode });
const byKey = (key: string) => tvKey({ key, keyCode: 0 });

const cases: [TvKey, number[], string[]][] = [
	["Back", [461, 10009], ["Escape", "Backspace", "GoBack", "BrowserBack"]],
	["Play", [415], ["MediaPlay"]],
	["Pause", [19], ["MediaPause"]],
	["PlayPause", [10252], ["MediaPlayPause"]],
	["Stop", [413], ["MediaStop"]],
	["FastForward", [417], ["MediaFastForward"]],
	["Rewind", [412], ["MediaRewind"]],
	["Enter", [13], ["Enter"]],
	["ArrowUp", [38], ["ArrowUp"]],
	["ArrowDown", [40], ["ArrowDown"]],
	["ArrowLeft", [37], ["ArrowLeft"]],
	["ArrowRight", [39], ["ArrowRight"]],
];
for (const [want, codes, keys] of cases) {
	for (const code of codes) eq(byCode(code), want, `keyCode ${code}`);
	for (const key of keys) eq(byKey(key), want, `key ${key}`);
}

eq(tvKey({ key: "MediaPlay", keyCode: 461 }), "Play", "the key wins over the code");
eq(byKey("a"), null);
eq(byKey(" "), null);
eq(byCode(65, "a"), null);

console.log("tv-keys-check: ok");
