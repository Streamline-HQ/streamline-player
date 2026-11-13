// The desktop scrubber's hover preview with trickplay, on the engine. Expected: hovering the scrubber shows a preview
// whose background image is a sheet under /media/ at the position tileAt gives for the hover time, at the design's frame
// size; a hover near the start and one at the middle show different tiles (the fake player runs the catalogue's 5400 s
// over a 40 s clip, so the middle clamps to the last tile); with the tracks' trickplay forced to null the preview shows
// the still.
import { open, shown, target } from "./player-lib.mjs";
import { hoverAt, showsTile } from "./trickplay-lib.mjs";

export { target };
export const mockArgs = ["--clip", `${process.env.MEDIA_DIR ?? "/tmp/streamline-player"}/long.mkv`];
export const engine = true;

export default async (ctx) => {
  const { app, shot, log } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  await app.addInitScript(() => { window.__picture = true; });
  const out = {};
  await open(ctx, "/player/movies/2");
  await shown(ctx);
  const mid = await hoverAt(app, 0.5);
  await shot("desk-player-trickplay");
  out.mid = mid.peek;
  out.midOk = !!mid.peek?.image && await showsTile(mid.peek);
  const start = await hoverAt(app, 0.002);
  out.start = start.peek;
  out.startOk = !!start.peek?.image && await showsTile(start.peek);
  out.sheets = [out.mid, out.start].map((p) => /\/media\/[^/]+\/sheet_\d+\.jpg/.test(p?.image ?? ""));

  out.pageErrors = log.filter((l) => l.startsWith("PAGEERR"));
  await app.evaluate(() => localStorage.setItem("__noTrickplay", "1"));
  await open(ctx, "/player/movies/2");
  await shown(ctx);
  out.fallback = (await hoverAt(app, 0.5)).peek;
  await app.evaluate(() => localStorage.removeItem("__noTrickplay"));
  const ok =
    out.midOk && out.startOk && out.sheets.every(Boolean) && out.mid.frame === 180 && out.mid.radius === "8px" &&
    out.fallback && !out.fallback.image && out.fallback.still && !out.pageErrors.length;
  if (!ok) throw new Error(JSON.stringify(out));
  return out;
};
