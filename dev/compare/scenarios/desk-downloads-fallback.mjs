// The server answers but the app is offline, and the title is downloaded. Expected: the saved file plays, from the
// offline note when the route resumes and from 0 when it does not ("Play from start").
import { expect, pathOf, sample } from "./downloads-lib.mjs";
import { mockArgs, open, prepare, target } from "./player-lib.mjs";

export { mockArgs, target };

export default async (ctx) => {
  const { app, wait } = ctx;
  const out = {};
  await prepare(ctx);
  await open(ctx, "/player/movies/3");
  const seeded = { ...sample().find((e) => e.key === "movies:3"), media_id: "movie-3", offline: { position: 700, done: false, at: "2026-11-12T12:00:00Z" } };
  await app.evaluate((e) => {
    window.__shim.downloads.seed([e], 0);
    window.__shim.downloads.reach(false);
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    window.dispatchEvent(new Event("offline"));
  }, seeded);
  await wait(500);
  const click = (p) =>
    app.evaluate((p) => { const a = document.createElement("a"); a.href = p; document.body.appendChild(a); a.click(); a.remove(); }, p);
  const go = async (path) => {
    await click("/");
    await wait(1000);
    await click(path);
    await wait(2000);
    return app.evaluate(() => ({ url: window.__fake.loads.slice(-1)[0]?.url, at: window.__fake.loads.slice(-1)[0]?.at }));
  };
  out.resumed = await go("/player/movies/3?resume=1");
  await app.evaluate((e) => window.__shim.downloads.seed([e], 0), seeded);
  out.fresh = await go("/player/movies/3");
  expect("plays the file without resume", out.fresh.url, "/downloads/movies-3/video.mkv");
  expect("starts at 0 without resume", out.fresh.at ?? 0, 0);
  expect("starts at the note with resume", out.resumed.at, 700);
  expect("plays the file", out.resumed.url, "/downloads/movies-3/video.mkv");
  out.pageErrors = ctx.log.filter((l) => l.startsWith("PAGEERR"));
  expect("no page errors", out.pageErrors, []);
  return out;
};
