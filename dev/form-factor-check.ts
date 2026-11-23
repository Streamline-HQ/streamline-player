// node dev/form-factor-check.ts
import { strictEqual as eq } from "node:assert";
import { isPhoneSize, isTvAgent } from "../src/lib/platform/form-factor.ts";

eq(isPhoneSize(390, 844), true);
eq(isPhoneSize(844, 390), true);
eq(isPhoneSize(375, 667), true);
eq(isPhoneSize(599, 900), true);
eq(isPhoneSize(600, 900), false);
eq(isPhoneSize(834, 1194), false);
eq(isPhoneSize(1194, 834), false);
eq(isPhoneSize(1280, 800), false);
eq(isPhoneSize(500, 1200), true);

const webOS = (chrome: string) =>
	`Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36 WebAppManager`;
const tizen = (version: string, chrome: string) =>
	`Mozilla/5.0 (SMART-TV; LINUX; Tizen ${version}) AppleWebKit/537.36 (KHTML, like Gecko) ${chrome}/${version} TV Safari/537.36`;
eq(isTvAgent(webOS("87.0.4280.88")), true);
eq(isTvAgent(webOS("108.0.5359.211")), true);
eq(isTvAgent(webOS("120.0.6099.270")), true);
eq(isTvAgent(tizen("7.0", "94.0.4606.31")), true);
eq(isTvAgent(tizen("9.0", "120.0.6099.5")), true);
eq(
	isTvAgent(
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
	),
	false,
);
eq(
	isTvAgent(
		"Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
	),
	false,
);
eq(
	isTvAgent(
		"Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
	),
	false,
);

console.log("form-factor-check: ok");
