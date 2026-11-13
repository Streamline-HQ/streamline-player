// node dev/shaka-caps-check.ts
import { deepStrictEqual as same, strictEqual as eq, ok } from "node:assert";
import { buildCaps, type Probe } from "../src/lib/platform/browser-caps.ts";

const probe = (types: string[], over: Partial<Probe> = {}): Probe => ({
	supported: (t) => types.some((x) => t.includes(x)),
	decodes: async () => true,
	hdrDisplay: false,
	...over,
});

const none = await buildCaps(probe([]));
same(none.video, []);
same(none.audio.codecs, []);
same(none.hdr, { formats: [], dv_profiles: [] });
same(none.containers, ["mp4"]);
eq(none.hls_keyframe_exact, false);

// A browser without HEVC is not told it has it, and a codec it has is described by what it reports.
const firefox = await buildCaps(
	probe(["avc1.4D40", "avc1.6400", "avc1.6400", "av01.0.", "mp4a.40.2", "opus"]),
);
same(
	firefox.video.map((v) => v.codec),
	["h264", "av1"],
);
same(firefox.video[0]?.profiles, ["main", "high"]);
eq(firefox.video[0]?.max_level, 52);
eq(firefox.video[0]?.max_width, 3840);
eq(firefox.video[0]?.max_fps, 60);
same(firefox.audio.codecs, ["aac", "opus"]);

// The highest level the browser accepts, not the highest in the table.
const capped = await buildCaps(
	probe(["avc1.6400"], { supported: (t) => /avc1\.6400(1E|1F|28|29)/.test(t) }),
);
eq(capped.video[0]?.max_level, 41);

// A decoder that is not smooth at 4K and 60 fps is reported at what it manages.
const slow = await buildCaps(
	probe(["avc1.6400"], { decodes: async (_t, w, _h, fps) => w <= 1920 && fps <= 30 }),
);
eq(slow.video[0]?.max_width, 1920);
eq(slow.video[0]?.max_fps, 30);

// A browser that cannot say keeps the 1080p60 floor.
const unsure = await buildCaps(probe(["avc1.6400"], { decodes: async () => null }));
eq(unsure.video[0]?.max_width, 1920);
eq(unsure.video[0]?.max_fps, 60);

// HDR10 needs a ten-bit profile and an HDR display; Dolby Vision lists the profiles it decodes.
const hdr = await buildCaps(
	probe(["hvc1.2.4", "hvc1.1.6", "dvh1.05", "dvh1.08"], { hdrDisplay: true }),
);
same(hdr.hdr, { formats: ["hdr10", "dolby_vision"], dv_profiles: [5, 8] });
const sdr = await buildCaps(probe(["hvc1.2.4"], { hdrDisplay: false }));
same(sdr.hdr.formats, []);
const eightBit = await buildCaps(probe(["hvc1.1.6"], { hdrDisplay: true }));
same(eightBit.hdr.formats, []);

ok(hdr.video.some((v) => v.codec === "hevc" && v.profiles.includes("main 10")));
console.log("shaka caps ok");
