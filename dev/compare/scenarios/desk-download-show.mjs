// Starting downloads from a show's Detail: one episode, a season through the picker, the group popover with "Cancel remaining",
// and "Remove all" once everything is on the device.
import { expect, norm, starting, withTracks } from "./downloads-lib.mjs";
import { mockArgs, prepare, target } from "./player-lib.mjs";

export { mockArgs, target };
export const engine = true;

export default async (ctx) => {
  const { app, shot, wait } = ctx;
  await withTracks(ctx, prepare);
  const out = {};
  const { dlg, pop, toast, starts, removes, advance, finish, confirm, items, clear } = starting(ctx);
  await app.goto("http://localhost:1440/detail/series/1");
  await clear();
  await wait(400);
  const show = norm(await app.locator("h1").first().textContent());
  const eps = app.locator(".grid .ep");
  const epCount = await eps.count();
  const epButton = (n) => app.locator(`.grid .ep button[aria-label="Download ${show} S1 E${n}"]`);
  await epButton(1).click();
  await wait(800);
  expect("episode picker", [await dlg().getAttribute("aria-label"), norm(await dlg().locator(".total").textContent()).includes("episodes")], [`Download ${show} S1 E1`, false]);
  await confirm().click();
  await wait(800);
  expect("episode started", (await starts()).at(-1).keys, ["series:1:1:1"]);
  await app.locator(`.grid .ep button[aria-label="Cancel download of ${show} S1 E1"]`).waitFor();
  await advance(1e12);
  await wait(500);
  await app.locator(`.grid .ep button[aria-label="Remove download of ${show} S1 E1"]`).waitFor();

  const bar = (label) => app.locator(`button[aria-label^="${label}"]`).first();
  await app.locator(`button[aria-label^="Download Season 1"]`).click();
  await wait(800);
  out.season = { title: await dlg().getAttribute("aria-label"), total: norm(await dlg().locator(".total").textContent()), note: norm(await dlg().locator(".note").textContent()) };
  expect("season picker", out.season.title, "Download Season 1");
  const wantEpisodes = epCount - 1;
  if (!out.season.total.endsWith(` · ${wantEpisodes} episodes`)) throw new Error(`season total ${out.season.total} for ${wantEpisodes}`);
  if (!/converts them to 1080p/.test(out.season.note)) throw new Error(`season note ${out.season.note}`);
  await shot("desk-download-picker-season");
  await confirm().click();
  await wait(900);
  const seasonStart = (await starts()).at(-1).keys;
  expect("season keys", seasonStart.length, wantEpisodes);
  out.toastMany = await toast();
  if (!new RegExp(`^Downloading ${wantEpisodes} episodes · [\\d.]+ (GB|MB)$`).test(out.toastMany.title)) throw new Error(`toast ${JSON.stringify(out.toastMany)}`);
  const ringLabel = await app.locator(`button[aria-label^="Downloading Season 1"]`).getAttribute("aria-label");
  if (!/^Downloading Season 1 · \d+%$/.test(ringLabel)) throw new Error(`bulk label ${ringLabel}`);
  await advance(1e8);
  await wait(500);
  await app.locator(`button[aria-label^="Downloading Season 1"]`).click();
  await wait(800);
  out.group = { label: await pop().getAttribute("aria-label"), cancel: await pop().getByRole("button", { name: "Cancel remaining" }).count() };
  if (!new RegExp(`^Downloading · \\d+ of ${epCount} episodes: Season 1$`).test(out.group.label)) throw new Error(`group label ${out.group.label}`);
  await shot("desk-download-popover-group");
  await pop().getByRole("button", { name: "Cancel remaining" }).click();
  await wait(800);
  out.cancelled = await toast();
  expect("cancelled toast", out.cancelled.title, `Cancelled ${wantEpisodes} downloads`);
  expect("only unfinished removed", (await removes()).at(-1).keys.length, wantEpisodes);
  expect("first stays", (await items()).map((e) => e.key), ["series:1:1:1"]);

  await app.locator(`button[aria-label^="Download Season 1"]`).click();
  await wait(800);
  await confirm().click();
  await wait(800);
  await finish();
  await app.locator(`button[aria-label="Remove Season 1 from this device"]`).click();
  await wait(800);
  out.all = await pop().getAttribute("aria-label");
  await shot("desk-download-popover-group-done");
  await pop().getByRole("button", { name: "Remove all" }).click();
  await wait(800);
  out.removedAll = await toast();
  expect("remove all toast", out.removedAll.title, "Season 1 removed from this device");
  expect("empty again", (await items()).length, 0);

  out.pageErrors = ctx.log.filter((l) => l.startsWith("PAGEERR"));
  expect("no page errors", out.pageErrors, []);
  return out;
};
