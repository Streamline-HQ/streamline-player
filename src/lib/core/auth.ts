export type SignInErrorCode = "state" | "denied" | "invalid_grant" | "network";

export class SignInError extends Error {
	readonly code: SignInErrorCode;
	constructor(code: SignInErrorCode) {
		super(code);
		this.code = code;
	}
}

const base64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");

export async function challengeFor(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	return base64url(new Uint8Array(digest));
}

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
	const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
	return { verifier, challenge: await challengeFor(verifier) };
}

// Edge and Opera also say Chrome, and Chrome also says Safari: the order matters.
export function browserDeviceName(userAgent: string): string {
	const browser = /Edg\//.test(userAgent)
		? "Edge"
		: /Firefox\//.test(userAgent)
			? "Firefox"
			: /Chrome\//.test(userAgent)
				? "Chrome"
				: /Safari\//.test(userAgent)
					? "Safari"
					: "Browser";
	const os = /Windows/.test(userAgent)
		? "Windows"
		: /Android/.test(userAgent)
			? "Android"
			: /iPhone|iPad/.test(userAgent)
				? "iOS"
				: /Mac OS X|Macintosh/.test(userAgent)
					? "macOS"
					: /Linux|X11/.test(userAgent)
						? "Linux"
						: "unknown OS";
	return `${browser} on ${os}`;
}

/** Typed as "streamline.home.arpa", meaning https; an explicit http:// is kept for a LAN server without TLS. */
export const serverAddress = (typed: string) => {
	const t = typed.trim().replace(/\/+$/, "");
	return t.includes("://") ? t : `https://${t}`;
};

const POLL_REFUSALS: Record<string, string> = {
	authorization_pending: "pending",
	slow_down: "slow_down",
	access_denied: "denied",
	expired_token: "expired",
};

/** A pairing poll's error body, named as the pairing flow knows it; null for any other error. */
export function pollAnswer(body: string): string | null {
	try {
		return POLL_REFUSALS[JSON.parse(body)?.error?.code] ?? null;
	} catch {
		return null;
	}
}

/** What a TV browser pairs as. The server shows a platform containing "tv" with the TV icon. */
export function tvDevice(userAgent: string): { name: string; platform: string } {
	if (/Web0S/.test(userAgent)) return { name: "LG TV", platform: "webos-tv" };
	if (/Tizen/.test(userAgent)) return { name: "Samsung TV", platform: "tizen-tv" };
	return { name: "Smart TV", platform: "web-tv" };
}

/** Only a path on this site may be the place sign-in returns to. */
export const safeNext = (next: string | null | undefined): string =>
	next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
