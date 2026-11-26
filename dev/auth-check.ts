// node dev/auth-check.ts
import { match, strictEqual as eq } from "node:assert";
import {
	browserDeviceName,
	challengeFor,
	pkcePair,
	pollAnswer,
	safeNext,
	serverAddress,
	tvDevice,
} from "../src/lib/core/auth.ts";

eq(
	await challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
	"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
);
const p = await pkcePair();
match(p.verifier, /^[A-Za-z0-9_-]{43}$/);
eq(await challengeFor(p.verifier), p.challenge);

eq(
	browserDeviceName("Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0"),
	"Firefox on Linux",
);
eq(
	browserDeviceName(
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
	),
	"Safari on macOS",
);
eq(
	browserDeviceName(
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
	),
	"Edge on Windows",
);
eq(
	browserDeviceName(
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
	),
	"Chrome on Linux",
);

eq(safeNext("/library/movies?x=1"), "/library/movies?x=1");
eq(safeNext("//evil.example"), "/");
eq(safeNext("https://evil.example"), "/");
eq(safeNext("/\\evil.example"), "/");
eq(safeNext(null), "/");

eq(serverAddress(" streamline.home.arpa/ "), "https://streamline.home.arpa");
eq(serverAddress("http://192.168.1.4:8080//"), "http://192.168.1.4:8080");

const refusal = (code: string) => JSON.stringify({ error: { code, message: code } });
eq(pollAnswer(refusal("authorization_pending")), "pending");
eq(pollAnswer(refusal("slow_down")), "slow_down");
eq(pollAnswer(refusal("access_denied")), "denied");
eq(pollAnswer(refusal("expired_token")), "expired");
eq(pollAnswer(refusal("invalid_request")), null);
eq(pollAnswer("TypeError: Failed to fetch"), null);

eq(
	tvDevice(
		"Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager",
	).platform,
	"webos-tv",
);
eq(
	tvDevice(
		"Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) 94.0.4606.31/7.0 TV Safari/537.36",
	).platform,
	"tizen-tv",
);
eq(tvDevice("Mozilla/5.0 (Linux; VIDAA) AppleWebKit/537.36").platform, "web-tv");
