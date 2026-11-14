// Removing a download that is playing (Assumed 14): the player stops first, then the card goes.
import { expect, pathOf, starting, withTracks } from "./downloads-lib.mjs";
import { mockArgs, prepare, target } from "./player-lib.mjs";

export { mockArgs, target };
export const engine = true;

export default async (ctx) => {
  const { app, wait } = ctx;
  await withTracks(ctx, prepare);
  const out = {};
  const { clear } = starting(ctx);
  await app.goto("http://localhost:1440/detail/series/1");
  await clear();
  await wait(400);
  await app.locator(".grid .ep button.play-ep").first().click();
  for (let i = 0; i < 80 && !(await app.evaluate(() => window.__fake?.p.playing)); i++) await app.waitForTimeout(100);
  await app.evaluate(() => { window.__fakeTick = true; window.__fake.tickOn(); });
  await wait(800);
  await app.mouse.move(600, 400);
  await app.mouse.move(640, 430);
  await wait(500);
  await app.locator('.bottom button[aria-label="Picture in picture"]').click();
  await app.waitForTimeout(700);
  await wait(500);
  expect("mini plays", await app.locator(".mini").count(), 1);
  const stopped = () => app.evaluate(() => window.__calls.filter((c) => c === "stop_session").length);
  const before = await stopped();
  await app.evaluate(() => window.__shim.downloads.seed([{ key: "series:1:1:1", media_id: "m", quality: "1080p", audio: [], subtitles: [], state: "done", progress: 1, bytes: 1e9, size: 1e9, error: null, added_at: "2026-11-12T10:00:00Z", offline: null, watched: false, meta: { kind: "series", title_id: 1, title: "Severance", year: null, runtime: 48, season: 1, episode: 1, episode_title: "Episode 1", poster: "series/1/poster.jpg", still: "series/1/backdrop.jpg" } }], 0));
  await app.evaluate(() => { const a = document.createElement("a"); a.href = "/downloads"; document.body.appendChild(a); a.click(); a.remove(); });
  await wait(1500);
  expect("on downloads with the mini", [await pathOf(app), await app.locator(".mini").count()], ["/downloads", 1]);
  await app.locator('.page .card[data-key="series:1:1:1"] button[aria-label="Remove download"]').click();
  await wait(1200);
  out.playerClosed = { stops: (await stopped()) - before, mini: await app.locator(".mini").count(), card: await app.locator('.page .card[data-key="series:1:1:1"]').count() };
  expect("player closed first", out.playerClosed, { stops: 1, mini: 0, card: 0 });
  out.pageErrors = ctx.log.filter((l) => l.startsWith("PAGEERR"));
  expect("no page errors", out.pageErrors, []);
  return out;
};
