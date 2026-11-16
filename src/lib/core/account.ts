export type FieldError = { field: "picture"; message: string };

export const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PICTURE_MAX = 512 * 1024;

/** What `FieldError.message` holds when the server sent no words of its own: the screen words these. */
export const CODES = ["too_large", "unsupported_type", "unknown"] as const;
export type Code = (typeof CODES)[number];

export function refusal(body: string): FieldError {
	let code = "";
	let message = "";
	try {
		const e = JSON.parse(body)?.error;
		code = typeof e?.code === "string" ? e.code : "";
		message = typeof e?.message === "string" ? e.message : "";
	} catch {}
	return {
		field: "picture",
		message: message || (CODES.includes(code as Code) ? code : "unknown"),
	};
}

/** The problem with a picture before any request leaves, as the server would name it. */
export function pictureProblem(file: {
	type: string;
	size: number;
}): "unsupported_type" | "too_large" | null {
	if (!PICTURE_TYPES.includes(file.type)) return "unsupported_type";
	return file.size > PICTURE_MAX ? "too_large" : null;
}
