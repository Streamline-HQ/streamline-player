// The engine refuses the subtitle file (an expired signature answers 403). Expected: no cue is drawn, the screen says
// "Subtitles unavailable", and the picture keeps playing.
import { engine, playMovie, realClock, show, target, until, video } from "./web-play-lib.mjs";

export { engine, realClock, target };
export const mockArgs = ["--clip", `${process.env.MEDIA_DIR ?? "/tmp/streamline-player"}/multi.mkv`];

export default async (ctx) => {
  const { app, shot } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  await app.route(/\/media\/.*\.vtt/, (r) => r.fulfill({ status: 403, body: "" }));
  await playMovie(ctx);
  await until(app, "playing", (v) => v.ready >= 3 && !v.paused);
  await show(app);
  await app.locator('.bottom button[aria-label="Subtitles"]').click();
  await app.waitForTimeout(500);
  await app.locator("[data-menu-panel] .opt").nth(1).click();
  const out = { said: false, cues: 0, paused: null };
  for (let i = 0; i < 25 && !out.said; i++) {
    await app.waitForTimeout(200);
    out.said = (await app.getByText("Subtitles unavailable").count()) > 0;
  }
  await shot("web-play-subtitle-refused");
  out.cues = await app.locator(".cue").count();
  out.paused = (await video(app))?.paused;
  if (!out.said || out.cues || out.paused) throw new Error(JSON.stringify(out));
  return out;
};
