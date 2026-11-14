// Starting, watching and removing a download from the rest of the desktop app, the movie side: the track picker at each quality,
// the popover in its states, the button on Detail, and "use these choices for every download". The shim fakes the Rust queue.
import { expect, norm, pathOf, starting, withTracks } from "./downloads-lib.mjs";
import { mockArgs, prepare, target } from "./player-lib.mjs";

export { mockArgs, target };
export const engine = true;

export default async (ctx) => {
  const { app, shot, wait } = ctx;
  await withTracks(ctx, prepare);
  const out = {};
  const { dlg, pop, toast, starts, removes, advance, finish, confirm, items } = starting(ctx);
  await app.goto("http://localhost:1440/detail/movies/1");
  await wait(800);
  const movie = norm(await app.locator("h1").first().textContent());
  const dlButton = (label) => app.locator(`.actions button[aria-label="${label}"]`);
  await dlButton(`Download ${movie}`).waitFor();
  await shot("desk-download-detail");
  await dlButton(`Download ${movie}`).click();
  await wait(800);
  out.picker = {
    title: await dlg().getAttribute("aria-label"),
    quality: await dlg().locator("fieldset button[aria-pressed=true]").textContent(),
    note: norm(await dlg().locator(".note").textContent()),
    audio: await dlg().locator('.list').first().getByRole("checkbox").evaluateAll((els) => els.map((e) => ({ on: String(e.checked), text: e.closest("label").innerText.replace(/\s+/g, " ").trim() }))),
    total: norm(await dlg().locator(".total").textContent()),
    enabled: await confirm().isEnabled(),
  };
  expect("picker", [out.picker.title, out.picker.quality, out.picker.note], [`Download ${movie}`, "1080p", "The server converts it to 1080p first, so the download takes longer to start."]);
  expect("audio rows", out.picker.audio.map((a) => a.on), ["true", "false", "false"]);
  if (!/^English · original/.test(out.picker.audio[0].text)) throw new Error(`first audio ${out.picker.audio[0].text}`);
  if (!/TrueHD 7\.1 → EAC3 5\.1/.test(out.picker.audio[0].text)) throw new Error(`1080p converts TrueHD: ${out.picker.audio[0].text}`);
  expect("download enabled", out.picker.enabled, true);
  await shot("desk-download-picker-1080p");

  await dlg().locator("fieldset button", { hasText: "Original" }).click();
  await wait(500);
  out.original = { note: norm(await dlg().locator(".note").textContent()), pressed: await dlg().locator("fieldset button[aria-pressed=true]").textContent(), first: norm(await dlg().locator('.list').first().locator(".row").first().innerText()) };
  if (!/^The file as it is on the server: .+\. Nothing is converted\.$/.test(out.original.note)) throw new Error(`note ${out.original.note}`);
  if (!/TrueHD 7\.1$/.test(out.original.first.split("\n").join(" ").replace(/\s+\S+ GB$|\s+\d+ MB$/, "").trim())) throw new Error(`original keeps TrueHD: ${out.original.first}`);
  await shot("desk-download-picker-original");
  const boxes = dlg().locator('.list').first().getByRole("checkbox");
  const total0 = norm(await dlg().locator(".total").textContent());
  await boxes.nth(0).click();
  await wait(300);
  out.none = { enabled: await confirm().isEnabled(), total: norm(await dlg().locator(".total").textContent()) };
  expect("none picked disables", out.none.enabled, false);
  if (out.none.total === total0) throw new Error("the total did not change when the audio was unticked");
  await boxes.nth(1).click();
  await wait(300);
  expect("one picked enables", await confirm().isEnabled(), true);
  await boxes.nth(0).click();
  await dlg().locator('.subs').getByRole("checkbox").first().click();
  await wait(300);
  out.cantShow = await dlg().locator('.subs').getByRole("checkbox").evaluateAll((els) => els.map((e) => ({ dis: e.disabled, on: String(e.checked), text: e.closest("label").innerText.replace(/\s+/g, " ").trim() })));
  expect("vobsub", [out.cantShow[3].dis, /can’t be shown here/.test(out.cantShow[3].text)], [true, true]);
  await confirm().click();
  await wait(900);
  expect("dialog closed", await dlg().count(), 0);
  const first = (await starts())[0];
  const request = first && first.keys;
  expect("start key", request, ["movies:1"]);
  const queued = (await items())[0];
  expect("start request", [queued.quality, queued.audio.map((a) => a.index), queued.subtitles.map((s) => s.index), queued.meta.title, queued.meta.poster, queued.meta.still],
    ["original", [1, 2], [4], movie, "movies/1/poster.jpg", "movies/1/backdrop.jpg"]);
  out.toast = await toast();
  if (out.toast.title !== `Downloading · ${movie}` || !/^Original · /.test(out.toast.text)) throw new Error(`toast ${JSON.stringify(out.toast)}`);
  await shot("desk-download-started");
  await dlButton(`Cancel download of ${movie}`).waitFor();
  out.ring = await dlButton(`Cancel download of ${movie}`).locator(".ring").count();
  expect("ring", out.ring, 1);

  await dlButton(`Cancel download of ${movie}`).click();
  await wait(800);
  out.waiting = { label: await pop().getAttribute("aria-label"), cancel: await pop().getByRole("button", { name: "Cancel" }).count() };
  expect("waiting popover", [out.waiting.label, out.waiting.cancel], [`Waiting: ${movie}`, 1]);
  await shot("desk-download-popover-waiting");
  await advance(1e8);
  await wait(500);
  out.downloading = { label: await pop().getAttribute("aria-label"), meta: norm(await pop().locator(".meta").textContent()) };
  expect("downloading popover", out.downloading.label, `Downloading: ${movie}`);
  if (!/MB\/s/.test(out.downloading.meta) && !/Starting/.test(out.downloading.meta)) throw new Error(`rate ${out.downloading.meta}`);
  await shot("desk-download-popover-downloading");
  await app.keyboard.press("Escape");
  await wait(700);
  expect("escape closes", await app.locator(".dl-pop").count(), 0);
  await dlButton(`Cancel download of ${movie}`).click();
  await wait(700);
  await pop().getByRole("button", { name: "Open Downloads" }).click();
  await wait(1200);
  expect("arrow", await pathOf(app), "/downloads");
  await app.goBack();
  await wait(1500);

  await finish();
  await dlButton(`Remove download of ${movie}`).waitFor();
  out.doneIcon = await dlButton(`Remove download of ${movie}`).locator(".sl-ico").count();
  await dlButton(`Remove download of ${movie}`).click();
  await wait(800);
  out.done = { label: await pop().getAttribute("aria-label"), grid: norm(await pop().locator(".sl-dlpop__grid").textContent()) };
  expect("done popover", out.done.label, `On this device: ${movie}`);
  if (!/Size.+GB.*QualityOriginal/.test(out.done.grid.replace(/\s+/g, ""))) throw new Error(`grid ${out.done.grid}`);
  await shot("desk-download-popover-done");
  await pop().getByRole("button", { name: "Remove download" }).click();
  await wait(700);
  out.removed = await toast();
  expect("removed toast", out.removed.title, "Removed from this device");
  expect("removed logged", (await removes()).at(-1).keys, ["movies:1"]);

  await app.goto("http://localhost:1440/detail/movies/1");
  await wait(800);
  await dlButton(`Download ${movie}`).click();
  await wait(800);
  await dlg().locator("fieldset button", { hasText: "720p" }).click();
  await dlg().getByRole("checkbox", { name: /Use these choices/ }).click();
  await confirm().click();
  await wait(900);
  expect("remembered start", (await starts()).at(-1).keys, ["movies:1"]);
  await app.goto("http://localhost:1440/detail/movies/2");
  await wait(800);
  const second = norm(await app.locator("h1").first().textContent());
  await dlButton(`Download ${second}`).click();
  await wait(900);
  expect("no dialog the second time", await dlg().count(), 0);
  const quick = (await items()).find((e) => e.key === "movies:2");
  expect("same quality", quick?.quality, "720p");
  await app.goto("http://localhost:1440/settings");
  await wait(800);
  out.settings = {
    quality: norm(await app.locator("#downloads, [data-sec=downloads]").first().textContent()),
    pick: await app.getByRole("switch", { name: "Choose tracks for each download" }).getAttribute("aria-checked"),
  };
  expect("pick off", out.settings.pick, "false");

  out.pageErrors = ctx.log.filter((l) => l.startsWith("PAGEERR"));
  expect("no page errors", out.pageErrors, []);
  return out;
};
