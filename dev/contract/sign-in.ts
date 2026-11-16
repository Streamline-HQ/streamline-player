// A browser's sign-in as the web player does it, for checks that need a bearer token: authorize, then the code exchange.
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const REDIRECT = "http://localhost:1430/signin/callback";

export async function browserToken(api: string, deviceName = "Chrome"): Promise<string> {
	const query = new URLSearchParams({
		redirect_uri: REDIRECT,
		state: "check",
		code_challenge: CHALLENGE,
		code_challenge_method: "S256",
	});
	const back = await fetch(`${api}/authorize?${query}`, { redirect: "manual" });
	const code = new URL(back.headers.get("location") ?? "").searchParams.get("code");
	const res = await fetch(`${api}/auth/token`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			grant_type: "authorization_code",
			code,
			code_verifier: VERIFIER,
			redirect_uri: REDIRECT,
			device_name: deviceName,
		}),
	});
	return ((await res.json()) as { access_token: string }).access_token;
}
