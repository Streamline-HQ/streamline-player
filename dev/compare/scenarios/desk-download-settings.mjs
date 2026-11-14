// The Downloads section of Settings on the desktop: its rows, the storage line, and that the chosen quality is kept and opens the picker.
import { expect, norm, STORAGE, TRACKS, sample } from "./downloads-lib.mjs";
import { mockArgs, prepare, target } from "./player-lib.mjs";

export { mockArgs, target };
export const engine = true;

export default async (ctx) => {
  const { app, shot, wait } = ctx;
  await prepare(ctx);
  await app.addInitScript((t) => { window.__tracks = { ...window.__tracks, ...t }; }, TRACKS);
  await app.setViewportSize({ width: 1440, height: 900 });
  await app.addInitScript(([e, s]) => { window.__shim.downloads.storage(...s); window.__shim.downloads.seed(e, 0); }, [sample().filter((e) => e.state === "done").slice(0, 3), STORAGE]);
  await app.goto("http://localhost:1440/settings");
  await wait(1000);
  const section = app.locator('[data-sec="downloads"]');
  const out = {};
  out.nav = (await app.locator("nav button").allTextContents()).map(norm);
  expect("nav has Downloads after the subtitles", out.nav.slice(1, 4), ["Playback", "Audio & subtitles", "Downloads"]);
  out.title = norm(await section.locator("h3").first().textContent());
  expect("section title", out.title, "Downloads");
  out.rows = (await section.locator(".label").allTextContents()).map(norm);
  expect("rows", out.rows, ["Download quality", "Choose tracks for each download", "Storage"]);
  out.descs = (await section.locator(".desc").allTextContents()).map(norm);
  expect("descs", out.descs, [
    "Lower qualities are transcoded on the server before they download.",
    "Asks which audio and subtitle tracks to take with it. Off takes your audio and subtitle languages.",
    "3 items available offline",
  ]);
  out.meter = (await section.locator(".legend span").allTextContents()).map(norm);
  expect("meter", out.meter, ["21.9 GB Streamline", "612.4 GB other apps", "341.8 GB free"]);
  expect("quality default", norm(await section.locator('fieldset[aria-label="Download quality"] button[aria-pressed="true"]').textContent()), "1080p");
  expect("pick default", await section.locator('input[aria-label="Choose tracks for each download"]').isChecked(), true);
  await section.scrollIntoViewIfNeeded();
  await wait(700);
  await shot("desk-download-settings");
  await section.locator('fieldset[aria-label="Download quality"] button:text-is("720p")').click();
  await wait(400);
  await app.reload();
  await wait(2500);
  expect("quality kept", norm(await app.locator('[data-sec="downloads"] fieldset[aria-label="Download quality"] button[aria-pressed="true"]').textContent()), "720p");
  await app.goto("http://localhost:1440/detail/movies/1");
  await wait(800);
  await app.locator('.actions button[aria-label^="Download "]').click();
  await wait(900);
  out.picker = norm(await app.locator('[role="dialog"][aria-modal="true"] fieldset button[aria-pressed="true"]').textContent());
  expect("picker opens on 720p", out.picker, "720p");
  expect("no page errors", ctx.log.filter((l) => l.startsWith("PAGEERR")), []);
  return out;
};
