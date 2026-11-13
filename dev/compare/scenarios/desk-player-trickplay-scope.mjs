// Trickplay on a 2.39:1 clip. Expected: the tile (320x134) covers the 16:9 preview frame, centred, so no empty strip
// shows below the picture; the position is the one the cover model gives for the hover time.
import { open, shown, target } from "./player-lib.mjs";
import { hoverAt, showsTile } from "./trickplay-lib.mjs";

export { target };
export const mockArgs = ["--clip", `${process.env.MEDIA_DIR ?? "/tmp/streamline-player"}/scope.mkv`];
export const engine = true;

export default async (ctx) => {
  const { app, shot, log } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  await app.addInitScript(() => { window.__picture = true; });
  await open(ctx, "/player/movies/2");
  await shown(ctx);
  const mid = await hoverAt(app, 0.002);
  await shot("desk-player-trickplay-scope");
  const out = { peek: mid.peek, pageErrors: log.filter((l) => l.startsWith("PAGEERR")) };
  out.tileOk = !!mid.peek?.image && await showsTile(mid.peek);
  const [, py] = (mid.peek?.position ?? "0 0").split(" ").map(parseFloat);
  out.covers = mid.peek ? py <= 0 : false;
  if (!out.tileOk || !out.covers || out.pageErrors.length) throw new Error(JSON.stringify(out));
  return out;
};
