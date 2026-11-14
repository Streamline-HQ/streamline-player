// Downloads without the server. Expected: the player's offline halt names the downloads and goes to them; going
// offline shows the toast and the Downloads banner; a download plays from its folder with no call to the server, and
// what was watched is noted on its card; a reload offline offers "Watch a download" on the load failure; coming back
// syncs the notes once, says so in a toast and clears the cards' lines; with nothing noted the toast has no second line.
import { bar, expect, norm, openFromHome, pathOf, sample, shimItems, shimLog } from "./downloads-lib.mjs";
import { jump, mockArgs, open, prepare, target } from "./player-lib.mjs";

export { mockArgs, target };

const OFFLINE_RAW = "error sending request for url (http://127.0.0.1:8081/api/v1/playback/sessions)";
const NO_NOTES = () => sample().map((e) => ({ ...e, offline: null }));

export default async (ctx) => {
  const { app, ctx: browser, shot, wait } = ctx;
  const out = {};
  await prepare(ctx);
  // After a reload the page's fake queue is gone: the init script rebuilds it, with the server unreachable.
  await app.addInitScript(() => {
    const saved = localStorage.getItem("__offlineSeed");
    if (!saved) return;
    window.__shim.downloads.storage(21.9e9, 612.4e9, 341.8e9);
    window.__shim.downloads.seed(JSON.parse(saved), 0);
    window.__shim.downloads.reach(false);
  });
  let blocked = false;
  await browser.route("http://127.0.0.1:8099/**", (route) => (blocked ? route.abort("connectionrefused") : route.continue()));
  const toast = async () => ({
    title: norm((await app.locator('[role="status"] .sl-toast__title').textContent({ timeout: 100 }).catch(() => "")) ?? ""),
    text: norm((await app.locator('[role="status"] .sl-toast__text').textContent({ timeout: 100 }).catch(() => "")) ?? ""),
  });
  const within = async (what, test, ms = 6000) => {
    for (let left = ms; left > 0; left -= 250) {
      const got = await test();
      if (got) return got;
      await wait(250);
    }
    throw new Error(`${what}: not within ${ms / 1000} s`);
  };
  const calls = () => app.evaluate(() => [...window.__calls]);
  const serverCalls = (list) => list.filter((c) => ["start_session", "decisions", "media_tracks", "heartbeat", "stop_session", "patch_session"].includes(c));
  const goOffline = async () => {
    blocked = true;
    await app.evaluate(() => {
      window.__shim.downloads.reach(false);
      window.dispatchEvent(new Event("offline"));
    });
  };
  const comeBack = async () => {
    blocked = false;
    await app.evaluate(() => {
      window.__shim.downloads.reach(true);
      window.dispatchEvent(new Event("online"));
    });
  };

  await open(ctx, "/player/movies/1");
  await app.evaluate((e) => window.__shim.downloads.seed(e, 0), NO_NOTES());
  let nudge = 0;
  const reveal = async () => {
    nudge += 13;
    await app.mouse.move(300 + nudge, 300 + nudge);
    await app.mouse.move(310 + nudge, 310 + nudge);
    await wait(500);
  };
  await reveal();
  await jump(ctx, 500);
  await app.evaluate((raw) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    window.__failStart = raw;
  }, OFFLINE_RAW);
  await reveal();
  await app.locator('.bottom button[aria-label="Quality"]').click();
  await wait(500);
  await app.locator("[data-menu-panel] .opt", { hasText: "4 Mbit/s" }).click();
  await wait(1200);
  out.halt = await app.evaluate(() => {
    const h = document.querySelector(".halt");
    const t = (s) => h?.querySelector(s)?.innerText.replace(/\s+/g, " ").trim() ?? null;
    return { eyebrow: t(".eyebrow")?.toLowerCase(), body: t(".halt .body"), actions: [...h.querySelectorAll(".actions button")].map((b) => b.innerText.trim()) };
  });
  expect("offline halt", [out.halt.eyebrow, /Your downloads still play\.$/.test(out.halt.body ?? ""), out.halt.actions.slice(0, 2)], ["offline", true, ["Try again", "Watch a download"]]);
  await shot("desk-downloads-offline-halt");
  await app.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    window.__failStart = null;
  });
  await app.locator(".halt .secondary", { hasText: "Watch a download" }).click();
  await wait(1500);
  expect("halt action lands", await pathOf(app), "/downloads");

  await goOffline();
  out.toast = await within("the offline toast", async () => {
    const t = await toast();
    return t.title ? t : null;
  });
  expect("offline toast", out.toast, { title: "You’re offline", text: "Downloads still play. Progress syncs when you’re back." });
  out.banner = norm(await within("the banner", () => app.locator(".page .banner").textContent({ timeout: 100 }).catch(() => null)));
  expect("banner", out.banner, "You’re offline Downloads still play. What you watch is saved on this device and syncs when you’re back online.");
  await shot("desk-downloads-offline");

  const before = await calls();
  await app.locator('.page .card[data-key="series:1:1:1"] .still').click();
  await within("local playback", () => app.evaluate(() => window.__fake?.p.playing && window.__fake.p.dur > 0), 8000);
  await app.evaluate(() => { window.__fakeTick = true; window.__fake.tickOn(); });
  await wait(1000);
  out.play = {
    path: await pathOf(app),
    loaded: await app.evaluate(() => window.__fake.loads.slice(-1).map((l) => l.url)),
    local: (await shimLog(app)).filter((l) => l.call === "local").map((l) => l.key),
    serverCalls: serverCalls((await calls()).slice(before.length)),
  };
  expect("local play", out.play, { path: "/player/series/1?local=1&s=1&e=1", loaded: ["/downloads/series-1-1-1/video.mkv"], local: ["series:1:1:1"], serverCalls: [] });
  await shot("desk-downloads-offline-player");
  await app.evaluate(() => { window.__fakeTick = false; });
  await jump(ctx, 2040);
  await app.keyboard.press("Escape");
  await wait(1500);
  expect("leaves to downloads", await pathOf(app), "/downloads");
  const note = (await shimLog(app)).filter((l) => l.call === "note").at(-1);
  expect("noted", [note?.key, note?.done, Math.abs((note?.position ?? 0) - 2040) <= 2], ["series:1:1:1", false, true]);
  out.card = norm(await app.locator('.page .card[data-key="series:1:1:1"] .off').textContent());
  expect("card line", out.card, "Watched to 34:00 offline · syncs when you’re back online");
  await shot("desk-downloads-offline-noted");

  await app.evaluate((items) => localStorage.setItem("__offlineSeed", JSON.stringify(items)), await shimItems(app));
  await app.goto("http://localhost:1440/");
  await wait(1500);
  out.failure = await within("the load failure", () => app.getByRole("button", { name: "Watch a download" }).count());
  await shot("desk-downloads-offline-failure");
  await app.getByRole("button", { name: "Watch a download" }).click();
  await wait(1500);
  out.groups = await app.locator(".page .done .group .gname").allTextContents();
  expect("reload lands on downloads", [await pathOf(app), out.groups.map(norm)], ["/downloads", ["Movies", "Severance", "Shōgun", "The Last of Us"]]);

  await comeBack();
  out.synced = await within("the synced toast", async () => {
    const t = await toast();
    return t.title === "Back online" ? t : null;
  });
  expect("back online toast", out.synced, { title: "Back online", text: "Synced what you watched offline · 1 download" });
  out.bannerGone = await within("the banner to go", async () => (await app.locator(".page .banner").count()) === 0);
  expect("sync logged once", (await shimLog(app)).filter((l) => l.call === "sync").length, 1);
  expect("note cleared", await app.locator(".page .card .off").count(), 0);
  await shot("desk-downloads-online-again");

  await wait(5000);
  await goOffline();
  await within("the offline toast again", async () => (await toast()).title === "You’re offline");
  await comeBack();
  out.quiet = await within("back online, nothing noted", async () => {
    const t = await toast();
    return t.title === "Back online" ? t : null;
  });
  expect("no second line", out.quiet, { title: "Back online", text: "" });
  out.pageErrors = ctx.log.filter((l) => l.startsWith("PAGEERR"));
  expect("no page errors", out.pageErrors, []);
  return out;
};
