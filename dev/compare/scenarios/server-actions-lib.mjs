// What an admin can do on the Server settings screen, on the desktop target and on the web target.
import { block, dev, expect, openServer, targets, text } from "./server-lib.mjs";

export { targets };

const MOCK = "http://127.0.0.1:8081";
export const post = (path, body) => fetch(`${MOCK}/dev/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
const row = (app, label) => app.locator(".server .std").filter({ has: app.locator(".label", { hasText: new RegExp(`^${label}$`) }) });
const toast = (app) => text(app.locator(".sl-toast").first());
const navCount = (app, title) => app.locator("nav .item").filter({ hasText: title }).locator(".count, .badge").first().textContent().then((t) => t.trim());
const dialog = (app) => app.locator('[role="dialog"]');
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();

export function recorder(app) {
  const all = [];
  app.on("request", (r) => {
    const path = new URL(r.url()).pathname.replace("/api/v1", "");
    if (r.url().includes("/api/v1/") && !path.startsWith("/dev/")) all.push({ method: r.method(), path, body: r.postData() });
  });
  return {
    all,
    writes: () => all.filter((c) => c.method !== "GET"),
    since: (n) => all.slice(n),
    mark: () => all.length,
  };
}

export async function actions(ctx, side) {
  const { app, shot, wait } = ctx;
  const rec = recorder(app);
  await openServer(ctx, side);
  const out = {};
  const writesFrom = (n) => rec.since(n).filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}${c.body ? ` ${c.body}` : ""}`);
  const act = async (what, fn) => {
    const n = rec.mark();
    await fn();
    await wait(700);
    return writesFrom(n);
  };
  await app.goto(`${side.url}/admin`);
  await wait(2500);

  // Settings.
  const watch = row(app, "Watch folders for changes");
  expect("watch writes", await act("watch", () => watch.locator('[role="switch"]').click()), ['PATCH /admin/settings {"library.watch":false}']);
  expect("watch toast", await toast(app), "Saved");
  expect("watch off", await watch.locator('[role="switch"]').getAttribute("aria-checked"), "false");

  const level = row(app, "Level").first();
  expect("level writes", await act("level", () => level.locator("button", { hasText: "Debug" }).click()), ['PATCH /admin/settings {"log.app.level":"debug"}']);
  expect("level toast", await toast(app), "Saved · applies after a restart");
  expect("after restart chip", (await text(level)).includes("After restart"), true);
  const note = app.locator(".server .note").first();
  expect("restart note", [await text(note.locator(".text")), await text(note.locator("button"))], ["1 change only applies after a restart: log.app.level.", "Restart now"]);
  expect("health tile", await text(app.locator(".tile", { hasText: "Health" }).first().locator(".value")), "Restart needed");
  expect("nav dot warns", await app.evaluate(() => {
    const dot = document.querySelector("nav .host .dot");
    const probe = document.createElement("i");
    probe.style.background = "var(--status-warning)";
    document.body.append(probe);
    const same = getComputedStyle(probe).backgroundColor === getComputedStyle(dot).backgroundColor;
    probe.remove();
    return same;
  }), true);
  await shot(`${side.target}-server-after-restart`);

  const tele = block(app, "Telemetry & retention");
  const otlp = tele.locator("input").first();
  await otlp.fill("otel:4318");
  expect("otlp writes", await act("otlp", () => otlp.press("Enter")), ['PATCH /admin/settings {"otel.endpoint":"otel:4318"}']);
  await otlp.fill("");
  expect("otlp clear writes", await act("otlp clear", () => otlp.press("Enter")), ['PATCH /admin/settings {"otel.endpoint":""}']);
  const keep = tele.locator("input").nth(1);
  await keep.fill("");
  expect("empty retention writes", await act("retention", () => keep.press("Enter")), []);
  expect("retention restored", await keep.inputValue(), "2160h");

  // Typing while the screen refreshes.
  const live = row(app, "Conversions at once").locator("input");
  await live.click();
  await live.fill("5");
  await wait(11000);
  expect("draft survives a refresh", await live.inputValue(), "5");
  await live.fill("abc");
  expect("abc writes", await act("abc", () => live.press("Enter")), []);
  expect("abc restored", await live.inputValue(), "2");
  await live.fill("999");
  expect("999 writes", await act("999", () => live.press("Enter")), ['PATCH /admin/settings {"stream.max_live":8}']);
  expect("999 shows 8", await live.inputValue(), "8");

  // Stop.
  const stopCamille = () => app.locator('.server .stream .stop[aria-label="Stop Camille’s stream"]').click();
  await stopCamille();
  await wait(700);
  expect("stop dialog", await norm(await dialog(app).locator(".sl-dialog__title").textContent()), "Stop Camille’s stream?");
  expect("stop body", await norm(await dialog(app).locator("p").first().textContent()), "Dune: Part Two on Chrome on Linux. Playback stops on Camille’s screen right away.");
  expect("stop presets", await dialog(app).locator("button[aria-pressed]").allTextContents().then((a) => a.map(norm)), ["Restarting the server", "Need the bandwidth", "Too many streams at once"]);
  expect("cancel sends nothing", await act("cancel", () => dialog(app).getByRole("button", { name: "Cancel" }).click()), []);
  await stopCamille();
  await wait(700);
  await dialog(app).getByRole("button", { name: "Need the bandwidth" }).click();
  await shot(`${side.target}-server-stop-dialog`);
  expect("stop writes", await act("stop", () => dialog(app).getByRole("button", { name: "Stop stream" }).click()), ['POST /admin/streams/s2/stop {"message":"Need the bandwidth"}']);
  expect("stop toast", await toast(app), "Stopped Camille’s stream · message sent");
  expect("stream rows", await app.locator(".server .stream .title").allTextContents(), ["Severance", "Arcane"]);
  expect("nav streams", await navCount(app, "Now playing"), "2");
  await app.locator(".server .stream").first().locator(".stop").click();
  await wait(700);
  expect("own stop dialog", await norm(await dialog(app).locator(".sl-dialog__title").textContent()), "Stop your stream?");
  expect("own stop writes", (await act("own stop", () => dialog(app).getByRole("button", { name: "Stop stream" }).click())).length, 1);
  expect("own stop toast", await toast(app), "Stopped your stream");

  // Devices.
  const apps = block(app, "Paired apps");
  const countBefore = await text(apps.locator("p"));
  const pixel = apps.locator(".item", { hasText: "Pixel 9" });
  expect("revoke writes", await act("revoke", () => pixel.getByRole("button", { name: "Revoke" }).click()), ["DELETE /admin/devices/d5"]);
  expect("revoke toast", await toast(app), "Device key revoked · it has to pair again");
  expect("pixel gone", await apps.locator(".item", { hasText: "Pixel 9" }).count(), 0);
  const n = Number.parseInt(countBefore, 10);
  expect("block count drops", (await text(apps.locator("p"))).startsWith(`${n - 1} devices`), true);
  const browsers = block(app, "Browser sessions");
  expect("end writes", await act("end", () => browsers.locator(".item", { hasText: "Chrome on Linux" }).getByRole("button", { name: "End" }).click()), ["DELETE /admin/devices/w1"]);
  expect("end toast", await toast(app), "Session ended");

  // Pairing.
  const waiting = () => block(app, "Waiting for approval");
  if (side.target === "web") {
    expect("approve writes", await act("approve", () => waiting().getByRole("button", { name: "Approve" }).click()), ["POST /auth/device/R4W-X9P/approve"]);
    expect("approve toast", await toast(app), "iPad mini paired to Antoine Langlois");
    expect("waiting gone", await waiting().count(), 0);
    expect("badge gone", await app.locator("nav .item", { hasText: "Devices" }).locator(".badge").count(), 0);
    const first = await block(app, "Paired apps").locator(".item").first().evaluate((el) => [el.querySelector(".title").textContent.trim(), [...el.querySelectorAll(".pill")].map((p) => p.textContent.trim())]);
    expect("new device row", first, ["iPad mini", ["New"]]);
    await shot(`${side.target}-server-paired`);

    await post("admin/pairing");
    await app.goto(`${side.url}/admin`);
    await wait(2500);
    expect("deny writes", await act("deny", () => waiting().getByRole("button", { name: "Deny" }).click()), ["POST /auth/device/R4W-X9P/deny"]);
    expect("deny toast", await toast(app), "Request R4W-X9P denied");
    expect("denied adds nothing", await app.locator(".server .pill", { hasText: "New" }).count(), 0);

    await post("admin/pairing");
    await app.goto(`${side.url}/admin`);
    await wait(2500);
    await post("admin/pairing/expire");
    await act("expired", () => waiting().getByRole("button", { name: "Approve" }).click());
    expect("expired row goes", await waiting().count(), 0);
    expect("expired toast", await toast(app), "No device is waiting with that code. It may have expired or already been approved.");
  } else {
    const opened = () => app.evaluate(() => window.__opened ?? []);
    expect("approve opens the browser", await act("approve", () => waiting().getByRole("button", { name: "Approve" }).click()), []);
    expect("opened", await opened(), ["http://localhost:1430/pair?code=R4W-X9P"]);
    expect("finish toast", await toast(app), "Finish in your browser…");
    expect("deny opens it too", await act("deny", () => waiting().getByRole("button", { name: "Deny" }).click()), []);
    expect("opened twice", await opened(), ["http://localhost:1430/pair?code=R4W-X9P", "http://localhost:1430/pair?code=R4W-X9P"]);
    expect("still waiting", await waiting().count(), 1);
    await post("admin/player-url/off");
    await app.goto(`${side.url}/admin`);
    await wait(2500);
    await act("no player", () => waiting().getByRole("button", { name: "Approve" }).click());
    expect("no player toast", await toast(app), "Open Streamline Player in a browser to approve this device.");
    expect("no more calls", (await opened()).length, 0);
  }

  // Library.
  await app.goto(`${side.url}/admin`);
  await wait(2500);
  const folders = block(app, "Folders");
  const movies = () => folders.locator(".item", { hasText: "Movies" });
  const series = () => folders.locator(".item", { hasText: "Series" });
  expect("scan writes", await act("scan", () => movies().getByRole("button", { name: "Scan" }).click()), ['POST /admin/library/scan {"folder_id":"movies"}']);
  expect("scanning toast", await toast(app), "Scanning Movies…");
  const busy = await movies().evaluate((el) => ({ button: el.querySelector("button").textContent.trim(), disabled: el.querySelector("button").disabled, bar: !!el.querySelector(".sl-progress"), aside: el.querySelector(".aside").textContent.trim() }));
  expect("scanning row", [busy.button, busy.disabled, busy.bar, /^\d+% · \d:\d\d left$/.test(busy.aside)], ["Scanning…", true, true, true]);
  await wait(3000);
  const later = await text(movies().locator(".aside"));
  expect("progress advances", later !== busy.aside, true);
  expect("scan all starts series only", await act("scan all", () => folders.getByRole("button", { name: "Scan all" }).click()), ['POST /admin/library/scan {}']);
  expect("scan all toast", await toast(app), "Scanning every library…");
  expect("series scanning", await text(series().locator("button")), "Scanning…");
  await shot(`${side.target}-server-scanning`);
  const lastBefore = await text(folders.locator(".kv"));
  await dev("admin/scan/finish");
  const finished = await text(app.locator(".sl-toast", { hasText: "Scan finished" }).first());
  await wait(1500);
  expect("rows return", [await text(movies().locator("button")), await text(series().locator("button"))], ["Scan", "Scan"]);
  expect("last scan changed", (await text(folders.locator(".kv"))) !== lastBefore, true);
  expect("finished toast", /^Scan finished · Movies and Series \d+ new files? · 0 errors$/.test(finished), true);

  // Cache.
  const cache = block(app, "Cache");
  expect("cache writes", await act("cache", () => cache.getByRole("button", { name: "Clear" }).click()), ["POST /admin/cache/clear"]);
  expect("cache note", await text(cache.locator(".note")), "Cache cleared. Streams in progress rebuild what they need.");
  expect("cache toast", await toast(app), "Transcode cache cleared · 3.2 GB freed");
  expect("cache tile", await text(app.locator(".tile", { hasText: "Transcode cache" }).locator(".sub")), "Empty");

  // Logs.
  await app.goto(`${side.url}/admin`);
  await wait(2500);
  const recent = block(app, "Recent");
  const lines = () => recent.locator(".line");
  const pick = (name) => recent.locator("fieldset button", { hasText: name }).click();
  await pick("Warnings");
  await wait(800);
  expect("warnings", await lines().evaluateAll((ls) => ls.map((l) => l.querySelector(".lv").textContent.trim())), ["error", "warn"]);
  await pick("Errors");
  await wait(800);
  expect("errors", await lines().count(), 1);
  await pick("All");
  await wait(800);
  await app.evaluate(() => {
    window.__tint = 0;
    new MutationObserver(() => {
      if (document.querySelector(".logs .line.fresh")) window.__tint++;
    }).observe(document.querySelector(".logs .list"), { subtree: true, attributes: true, childList: true });
  });
  await post("admin/log", { level: "warn", source: "disk", message: "Cache volume is 91% full" });
  await wait(3500);
  expect("new line first", (await text(lines().first())).includes("Cache volume is 91% full"), true);
  expect("it was tinted", (await app.evaluate(() => window.__tint)) > 0, true);
  await wait(2500);
  expect("tint fades", await recent.locator(".line.fresh").count(), 0);
  await shot(`${side.target}-server-logs-live`);
  const before = rec.all.filter((c) => c.path.startsWith("/admin/logs")).length;
  await recent.locator(".live").click();
  await wait(700);
  expect("paused", [await text(recent.locator(".live")), await recent.locator(".live").getAttribute("aria-pressed")], ["Paused", "false"]);
  const afterPause = rec.all.filter((c) => c.path.startsWith("/admin/logs")).length;
  await wait(10000);
  expect("no log request while paused", rec.all.filter((c) => c.path.startsWith("/admin/logs")).length, afterPause);
  expect("polling went on before", before > 0, true);
  const dl = rec.mark();
  await recent.getByRole("button", { name: "Download" }).click();
  await wait(400);
  expect("download request", rec.since(dl).map((c) => `${c.method} ${c.path}`), ["GET /admin/logs/download"]);
  expect("download toast", await toast(app), "streamline-logs.zip saved to Downloads");
  return out;
}
