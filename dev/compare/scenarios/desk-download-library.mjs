// The Library's poster button: a movie's three states and its accessible names, and a show's through its episodes.
import { expect, starting, withTracks } from "./downloads-lib.mjs";
import { mockArgs, prepare, target } from "./player-lib.mjs";

export { mockArgs, target };
export const engine = true;

export default async (ctx) => {
  const { app, shot, wait } = ctx;
  await withTracks(ctx, prepare);
  const out = {};
  const { finish, clear } = starting(ctx);
  await app.goto("http://localhost:1440/library/movies");
  await clear();
  await wait(400);
  const movie = (await app.locator(".poster .title").first().textContent()).trim();
  const poster = app.locator(".poster", { hasText: movie }).first();
  expect("poster idle", await poster.locator("button.dl").getAttribute("aria-label"), `Download ${movie}`);
  await shot("desk-download-library");
  await app.evaluate(() => localStorage.setItem("prefs", JSON.stringify({ dlPick: false })));
  await app.goto("http://localhost:1440/library/movies");
  await clear();
  await wait(400);
  await poster.locator("button.dl").click();
  await wait(800);
  out.poster = [await poster.locator("button.dl").getAttribute("aria-label")];
  expect("poster downloading", out.poster[0], `Downloading ${movie}`);
  await finish();
  out.poster.push(await poster.locator("button.dl").getAttribute("aria-label"));
  expect("poster downloaded", out.poster[1], `Downloaded · ${movie}`);
  await shot("desk-download-library-done");

  await app.goto("http://localhost:1440/library/series");
  await clear();
  await wait(800);
  const show = (await app.locator(".poster .title").first().textContent()).trim();
  const card = app.locator(".poster", { hasText: show }).first();
  out.show = [await card.locator("button.dl").getAttribute("aria-label")];
  if (!new RegExp(`^Download ${show} · \\d+ episodes?$`).test(out.show[0])) throw new Error(`show idle ${out.show[0]}`);
  await card.locator("button.dl").click();
  await wait(1000);
  out.show.push(await card.locator("button.dl").getAttribute("aria-label"));
  if (!new RegExp(`^Downloading ${show} · \\d+%$`).test(out.show[1])) throw new Error(`show downloading ${out.show[1]}`);
  await finish();
  out.show.push(await card.locator("button.dl").getAttribute("aria-label"));
  expect("show on device", out.show[2], `Remove ${show} from this device`);
  out.pageErrors = ctx.log.filter((l) => l.startsWith("PAGEERR"));
  expect("no page errors", out.pageErrors, []);
  return out;
};
