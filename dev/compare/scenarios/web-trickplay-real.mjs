// The web scrubber's hover preview with trickplay, on the engine and the page's own timers. Expected: while a 40 s clip
// plays, hovering the scrubber at 50 % shows a tile from a sheet under /media/ at the position tileAt gives, and the
// sheet request answered 200.
import { engine, mockArgs, playMovie, realClock, show, target, until } from "./web-play-lib.mjs";
import { hoverAt, showsTile } from "./trickplay-lib.mjs";

export { engine, mockArgs, realClock, target };

export default async (ctx) => {
  const { app, shot } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  const sheets = [];
  app.on("response", (r) => {
    if (/\/media\/[^/]+\/sheet_\d+\.jpg/.test(new URL(r.url()).pathname)) sheets.push({ status: r.status(), type: r.headers()["content-type"] });
  });
  await playMovie(ctx);
  await until(app, "playing", (v) => v.ready >= 3 && !v.paused);
  await show(app);
  const mid = await hoverAt(app, 0.5);
  await shot("web-trickplay-real");
  const out = { peek: mid.peek, duration: mid.duration, sheets };
  out.tileOk = !!mid.peek?.image && await showsTile(mid.peek);
  const ok = out.tileOk && /\/media\/[^/]+\/sheet_\d+\.jpg/.test(mid.peek.image) && sheets.length > 0 && sheets.every((s) => s.status === 200);
  if (!ok) throw new Error(JSON.stringify(out));
  return out;
};
