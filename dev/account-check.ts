// node dev/account-check.ts
import { deepStrictEqual as eq } from "node:assert";
import { PICTURE_MAX, PICTURE_TYPES, pictureProblem, refusal } from "../src/lib/core/account.ts";
import { chips } from "../src/lib/core/capabilities.ts";

eq(refusal('{"error":{"code":"too_large"}}').field, "picture");
eq(refusal('{"error":{"code":"unsupported_type"}}').field, "picture");
eq(refusal("not json"), { field: "picture", message: "unknown" });
eq(refusal('{"error":{"code":"boom"}}').message, "unknown");
eq(refusal('{"error":{"code":"too_large","message":"Too big."}}').message, "Too big.");
eq(PICTURE_TYPES, ["image/jpeg", "image/png", "image/webp"]);
eq(PICTURE_MAX, 512 * 1024);
eq(pictureProblem({ type: "image/png", size: 1024 }), null);
eq(pictureProblem({ type: "image/gif", size: 1024 }), "unsupported_type");
eq(pictureProblem({ type: "image/png", size: PICTURE_MAX + 1 }), "too_large");
const shim = {
	video: [{ codec: "h264" }, { codec: "hevc" }, { codec: "av1" }],
	hdr: { formats: ["hdr10", "hlg"] },
	audio: { codecs: ["aac", "ac3", "truehd", "dts", "flac"], passthrough: ["eac3"] },
	subtitles: ["srt", "ass"],
};
eq(
	chips(shim)
		.filter((c) => c.ok)
		.map((c) => c.name),
	["H.264", "HEVC", "AV1", "HDR10", "AAC", "AC3", "EAC3", "TrueHD", "DTS", "FLAC", "ASS", "SRT"],
);
eq(chips({ ...shim, subtitles: undefined }).length, 12);
console.log("account-check: ok");
