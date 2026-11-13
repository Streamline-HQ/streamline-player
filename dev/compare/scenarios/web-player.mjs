// The player's keys and bar on the web with the real player. Expected: Space pauses and plays the element, the arrows
// seek by 10 s and change the volume, M mutes, the controls hide after idle and a move brings them back, Back leaves
// and stops the session.
import { started, stopped, engine, listen, mockArgs, playMovie, realClock, show, target, until, video } from "./web-play-lib.mjs";

export { engine, mockArgs, realClock, target };

export default async (ctx) => {
  const { app, shot } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  const seen = listen(app);
  const out = {};
  await playMovie(ctx);
  await until(app, "playing", (v) => v.ready >= 3 && !v.paused && v.at > 1);
  const chrome = () => app.evaluate(() => Number(getComputedStyle(document.querySelector(".chrome")).opacity));
  await show(app);
  out.shown = await chrome();
  await app.waitForTimeout(4500);
  out.hidden = await chrome();
  await app.keyboard.press(" ");
  await app.waitForTimeout(500);
  out.spacePaused = (await video(app)).paused;
  await app.keyboard.press(" ");
  await app.waitForTimeout(500);
  out.spacePlayed = !(await video(app)).paused;
  const at = (await video(app)).at;
  await app.keyboard.press("ArrowRight");
  const jumped = await until(app, "forward 10", (v) => v.at >= at + 8, 15);
  out.forward = Number((jumped.at - at).toFixed(1));
  await app.keyboard.press("ArrowLeft");
  const back = await until(app, "back 10", (v) => v.at <= jumped.at - 6 && v.ready >= 2, 15);
  out.backward = Number((jumped.at - back.at).toFixed(1));
  const volume = (await video(app)).volume;
  await app.keyboard.press("ArrowDown");
  await app.waitForTimeout(300);
  out.volumeDown = (await video(app)).volume < volume;
  await app.keyboard.press("m");
  await app.waitForTimeout(300);
  out.muted = (await video(app)).muted;
  await shot("web-player");
  await app.keyboard.press("m");
  await show(app);
  await app.locator(".top .back").click();
  await app.waitForTimeout(1500);
  out.left = { url: await app.evaluate(() => location.pathname), stopped: stopped(seen), shown: (await video(app))?.shown ?? false };
  const ok =
    out.shown === 1 && out.hidden === 0 && out.spacePaused && out.spacePlayed &&
    out.forward >= 8 && out.forward <= 12 && out.backward >= 6 && out.volumeDown && out.muted &&
    out.left.url.startsWith("/detail/") && out.left.stopped === 1 && !out.left.shown;
  if (!ok) throw new Error(JSON.stringify(out));
  return out;
};
