// Leaving the player mid-play on the web, with the real player. Expected: Picture in picture, then Home, puts the
// <video> exactly on the mini player's art area and its time keeps rising; expanding returns to the full window on the
// same session (one POST /playback/sessions throughout); closing the tab sends a final progress beat.
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
  await app.waitForTimeout(1000);
  await app.getByRole("button", { name: "Home", exact: true }).click();
  await app.waitForTimeout(1500);
  const art = await app.locator(".mini .art").boundingBox();
  const mini = await video(app);
  const near = (a, b) => Math.abs(a - b) <= 2;
  out.mini = { art: { x: Math.round(art.x), y: Math.round(art.y), width: Math.round(art.width), height: Math.round(art.height) }, box: mini.box };
  out.boxMatches = near(mini.box.x, art.x) && near(mini.box.y, art.y) && near(mini.box.width, art.width) && near(mini.box.height, art.height);
  await shot("web-mini-real");
  await app.waitForTimeout(2500);
  const later = await video(app);
  out.rising = later.at - mini.at;

  await app.locator('.mini button[aria-label="Back to full player"]').click();
  await app.waitForTimeout(1500);
  const full = await video(app);
  out.expanded = { url: await app.evaluate(() => location.pathname), box: full.box, viewport: await app.evaluate(() => ({ width: innerWidth, height: innerHeight })), paused: full.paused };
  await app.waitForTimeout(2000);
  out.expandedRising = (await video(app)).at - full.at;
  out.sessions = started(seen);
  out.stopped = stopped(seen);

  // The server's watch position is written by every beat, so only one sent as the tab closes lands on the last time seen.
  const saved = async () => {
    const res = await fetch("http://127.0.0.1:8081/api/v1/watchstate", { headers: { Authorization: seen.auth } });
    return (await res.json()).items.find((w) => w.media_id === "movie-2")?.position_seconds ?? null;
  };
  const lastSeen = (await video(app)).at;
  out.savedBefore = await saved();
  await app.close({ runBeforeUnload: true });
  await new Promise((done) => setTimeout(done, 1500));
  out.savedAfter = await saved();
  out.lastSeen = Number(lastSeen.toFixed(1));
  out.finalBeat = Math.abs(out.savedAfter - lastSeen) <= 1.5 && out.savedAfter > (out.savedBefore ?? -1) + 0.2;

  const ok =
    out.boxMatches && out.rising >= 1.5 &&
    out.expanded.url.startsWith("/player/movies/") && out.expanded.box.width === out.expanded.viewport.width && out.expanded.box.height === out.expanded.viewport.height &&
    out.expandedRising >= 1.5 && out.sessions === 1 && out.stopped === 0 && out.finalBeat;
  if (!ok) throw new Error(JSON.stringify(out));
  return out;
};
