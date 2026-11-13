// A reload on the player route, where the autoplay policy may refuse sound. Expected: either playback resumes, or the
// player sits paused with a play button that starts it; never a spinner past 20 s and never the error halt. Which of
// the two happened is recorded per engine.
import { engine, mockArgs, playMovie, realClock, show, target, until, video } from "./web-play-lib.mjs";

export { engine, mockArgs, realClock, target };

export default async (ctx) => {
  const { app, shot } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  await playMovie(ctx);
  await until(app, "playing before the reload", (v) => v.ready >= 3 && !v.paused && v.at > 1);
  await app.reload();
  const out = { halts: 0 };
  let outcome = null;
  let base = null;
  for (let i = 0; i < 100 && !outcome; i++) {
    await app.waitForTimeout(200);
    const v = await video(app);
    out.halts += await app.locator(".halt").count();
    if (v && v.ready >= 3) base ??= v.at;
    if (v && !v.paused && v.ready >= 3 && v.at > base + 1) outcome = "resumed";
    const spinning = await app.locator(".spin").count();
    const offered = await app.locator('.surface[aria-label="Play"]').count();
    if (v && v.paused && offered && !spinning && i > 15) outcome = "paused with a play button";
  }
  out.outcome = outcome;
  out.spinner = await app.locator(".spin").count();
  if (outcome === "paused with a play button") {
    await show(app);
    const at = (await video(app)).at;
    await app.locator(".bar .big").click();
    await until(app, "play after the reload", (x) => !x.paused && x.at > at + 1, 15);
  }
  out.final = await video(app);
  await shot("web-play-reload");
  if (!outcome || out.halts || out.spinner) throw new Error(JSON.stringify(out));
  return out;
};
