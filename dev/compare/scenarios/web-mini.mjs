// The mini player on the web with the real player. Expected: the picture follows the card across pages; the card's
// pause and play reach the element; Close stops the session on the server and hides the picture.
import { started, stopped, engine, listen, mockArgs, playMovie, realClock, show, target, until, video } from "./web-play-lib.mjs";

export { engine, mockArgs, realClock, target };

export default async (ctx) => {
  const { app, shot } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  const seen = listen(app);
  const out = {};
  await playMovie(ctx);
  await until(app, "playing", (v) => v.ready >= 3 && !v.paused && v.at > 1);
  await show(app);
  await app.locator('.bottom button[aria-label="Picture in picture"]').click();
  await app.waitForTimeout(800);
  const rect = async () => {
    const art = await app.locator(".mini .art").boundingBox();
    const v = await video(app);
    return Math.abs(v.box.x - art.x) <= 2 && Math.abs(v.box.y - art.y) <= 2 && Math.abs(v.box.width - art.width) <= 2;
  };
  out.follows = {};
  for (const [name, path] of [["Movies", "Movies"], ["Shows", "Shows"], ["Home", "Home"]]) {
    await app.getByRole("button", { name: path, exact: true }).click();
    await app.waitForTimeout(1200);
    out.follows[name] = await rect();
  }
  await shot("web-mini");
  await app.locator('.mini button[aria-label="Pause"]').click();
  await app.waitForTimeout(600);
  out.paused = (await video(app)).paused;
  await app.locator('.mini button[aria-label="Play"]').click();
  await app.waitForTimeout(600);
  out.played = !(await video(app)).paused;
  await app.locator('.mini button[aria-label="Close picture in picture"]').click();
  await app.waitForTimeout(1200);
  out.closed = { miniGone: (await app.locator(".mini").count()) === 0, stopped: stopped(seen), picture: (await video(app))?.shown ?? false };
  out.sessions = started(seen);
  const ok = Object.values(out.follows).every(Boolean) && out.paused && out.played && out.closed.miniGone && out.closed.stopped === 1 && !out.closed.picture && out.sessions === 1;
  if (!ok) throw new Error(JSON.stringify(out));
  return out;
};
