// The Activity scenarios, run on the desktop target (:1440 behind the Tauri shim) and on the web target (:1430, after SSO).
import { targets } from "./browse-lib.mjs";

export { targets };

const MOCK = "http://127.0.0.1:8081";
const dev = (path) => fetch(`${MOCK}/dev/${path}`, { method: "POST" });
const post = (path, body) =>
  fetch(`${MOCK}/api/v1${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const pathOf = (app) => app.evaluate(() => location.pathname + location.search);
const bell = (app) => app.locator('.bar .actions button[aria-label^="Activity"]');
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();

function expect(what, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}

const bellState = async (app) => ({
  label: await bell(app).getAttribute("aria-label"),
  dot: await bell(app).locator(".sl-btn__dot").count(),
  on: await bell(app).evaluate((el) => el.classList.contains("on")),
});

const rowsOf = (app) => app.locator(".page section").evaluateAll((els) =>
  els.map((s) => ({
    day: s.querySelector("h2").textContent.trim(),
    rows: [...s.querySelectorAll(".row")].map((r) => ({
      head: r.querySelector(".h").textContent.trim(),
      name: r.querySelector(".n")?.textContent.trim() ?? "",
      text: r.querySelector(".t")?.textContent.trim() ?? "",
      at: r.querySelector(".at").textContent.trim(),
      poster: !!r.querySelector(".poster"),
      badge: !!r.querySelector(".badge"),
      sys: !!r.querySelector(".sys"),
      dot: r.querySelector(".dot").classList.contains("on"),
    })),
  })),
);

const summary = (app) => app.locator(".page .summary").textContent().then(norm);
const count = async (app) => (await app.locator(".page .row").count());

export async function feed(ctx, side, { noDownloads = false } = {}) {
  const { app, shot, wait } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  const reads = [];
  app.on("request", (r) => r.method() === "POST" && r.url().endsWith("/activity/read") && reads.push(r.postData()));
  await side.open(ctx);
  await wait(1500);
  const out = { target: side.target, noDownloads };
  const unreadCount = noDownloads ? 2 : 3;

  out.homeBell = await bellState(app);
  expect("home bell", out.homeBell, { label: `Activity, ${unreadCount} unread`, dot: 1, on: false });
  await shot(`${side.target}-activity-home${noDownloads ? "-nodl" : ""}`);
  await bell(app).click();
  await wait(1500);
  expect("bell lands", await pathOf(app), "/activity");
  out.bell = await bellState(app);
  expect("bell on activity", out.bell.on, true);

  out.heading = norm(await app.locator(".page h1").textContent());
  out.summary = await summary(app);
  out.filters = await app.locator(".page .filters button").evaluateAll((bs) => bs.map((b) => [b.textContent.trim(), b.getAttribute("aria-pressed")]));
  out.markAllDisabled = await app.getByRole("button", { name: "Mark all as read" }).isDisabled();
  expect("heading", out.heading, "Activity");
  expect("summary", out.summary, `${unreadCount} unread`);
  expect("filters", out.filters, [["All", "true"], ["Library", "false"], ["Downloads", "false"], ["Server", "false"]]);
  expect("mark all enabled", out.markAllDisabled, false);

  out.groups = await rowsOf(app);
  expect("days", out.groups.map((g) => g.day), ["Today", "Yesterday", "This week"]);
  expect("sizes", out.groups.map((g) => g.rows.length), noDownloads ? [3, 4, 3] : [4, 4, 3]);
  const first = out.groups[0].rows[0];
  expect("first row", [first.head, first.name, first.text, first.poster, first.badge, first.dot], ["2 new episodes", "Severance", "S2 · E8–E9 are ready to watch", true, true, true]);
  expect("dots", out.groups.flatMap((g) => g.rows).filter((r) => r.dot).length, unreadCount);
  const device = out.groups[1].rows.find((r) => r.head === "New device signed in");
  expect("device", [device.poster, device.sys, device.text], [false, true, "iPhone 16 Pro · Lyon, France"]);
  for (const r of [...out.groups[0].rows, ...out.groups[1].rows]) if (!/^\d\d:\d\d$/.test(r.at)) throw new Error(`time label ${r.at}`);
  expect("weekdays", out.groups[2].rows.map((r) => r.at), ["Thu", "Wed", "Tue"]);
  await shot(`${side.target}-activity${noDownloads ? "-nodl" : ""}`);

  const tiles = { Library: 7, Downloads: noDownloads ? 0 : 1, Server: 3 };
  out.filtered = {};
  for (const [label, rows] of Object.entries(tiles)) {
    await app.locator(".page .filters button", { hasText: label }).click();
    await wait(400);
    out.filtered[label] = { rows: await count(app), summary: await summary(app), pressed: (await app.locator('.page .filters button[aria-pressed="true"]').textContent()).trim() };
    expect(`${label} rows`, out.filtered[label], { rows, summary: `${unreadCount} unread`, pressed: label });
    if (label === "Downloads" || label === "Server") await shot(`${side.target}-activity-${label.toLowerCase()}${noDownloads ? "-nodl" : ""}`);
    if (rows === 0) {
      out.nothing = { title: norm(await app.locator(".page .empty .title").textContent()), bell: await bellState(app) };
      expect("nothing here", out.nothing.title, "Nothing here yet");
      expect("bell keeps dot", out.nothing.bell.dot, 1);
    }
  }
  await app.locator(".page .filters button", { hasText: "All" }).click();
  await wait(400);
  if (noDownloads) return out;

  await app.locator(".page .row").first().click();
  await wait(1500);
  out.opened = await pathOf(app);
  expect("opened", out.opened, "/detail/series/1?s=2");
  out.season = norm(await app.locator('.detail .seasons button[aria-pressed="true"]').textContent());
  expect("season", out.season, "Season 2");
  expect("reads", reads, [JSON.stringify({ ids: ["a1"] })]);
  await app.goBack();
  await wait(2500);
  out.afterRead = { summary: await summary(app), dot: (await rowsOf(app))[0].rows[0].dot };
  expect("after read", out.afterRead, { summary: "2 unread", dot: false });

  await dev("activity/unread");
  await app.reload();
  await wait(2500);
  expect("all unread", await summary(app), "11 unread");
  await app.locator(".page .filters button", { hasText: "Server" }).click();
  await wait(400);
  const before = await pathOf(app);
  await app.locator(".page .row", { hasText: "Server updated" }).click();
  await wait(1000);
  expect("stays", await pathOf(app), before);
  out.nowhere = { summary: await summary(app), dots: await app.locator(".page .row .dot.on").count() };
  expect("nowhere", out.nowhere.summary, "10 unread");
  await app.locator(".page .filters button", { hasText: "All" }).click();
  await wait(400);

  await app.getByRole("button", { name: "Mark all as read" }).click();
  await wait(1000);
  const caught = async () => ({
    summary: await summary(app),
    disabled: await app.getByRole("button", { name: "Mark all as read" }).isDisabled(),
    bell: await bellState(app),
  });
  out.allRead = await caught();
  expect("all read", out.allRead, { summary: "All caught up", disabled: true, bell: { label: "Activity", dot: 0, on: true } });
  await shot(`${side.target}-activity-read`);
  await app.reload();
  await wait(2500);
  out.allReadReloaded = await caught();
  expect("all read after reload", out.allReadReloaded, out.allRead);

  await app.goto(`${side.url}/`);
  await wait(1500);
  await dev("activity/unread");
  await app.reload();
  await wait(2500);
  expect("dot back", (await bellState(app)).dot, 1);
  const items = await (await fetch(`${MOCK}/api/v1/activity`)).json();
  await post("/activity/read", { ids: items.items.map((e) => e.id) });
  await app.clock.runFor(61000);
  await app.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await wait(1500);
  out.elsewhere = await bellState(app);
  expect("read elsewhere", [out.elsewhere.dot, out.elsewhere.label], [0, "Activity"]);
  return out;
}

export async function empty(ctx, side) {
  const { app, shot, wait } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  await side.open(ctx);
  await wait(1500);
  const out = { bell: await bellState(app) };
  expect("empty bell", [out.bell.dot, out.bell.label], [0, "Activity"]);
  await bell(app).click();
  await wait(1500);
  out.summary = await summary(app);
  out.title = norm(await app.locator(".page .empty .title").textContent());
  out.icon = await app.locator(".page .empty .sl-ico").count();
  out.markAllDisabled = await app.getByRole("button", { name: "Mark all as read" }).isDisabled();
  expect("empty page", [out.summary, out.title, out.icon, out.markAllDisabled], ["All caught up", "Nothing here yet", 1, true]);
  await shot(`${side.target}-activity-empty`);
  return out;
}

export async function errors(ctx, side) {
  const { app, shot, wait } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  const feedUrl = "**/api/v1/activity";
  const readUrl = "**/api/v1/activity/read";
  await app.route(feedUrl, (r) => r.abort());
  await side.open(ctx);
  await wait(1500);
  await bell(app).click();
  await wait(2500);
  const out = {};
  out.failed = { title: norm(await app.locator(".page .empty .title").textContent()), retry: await app.getByRole("button", { name: "Try again" }).count() };
  expect("failed", out.failed, { title: "Couldn’t load activity", retry: 1 });
  await shot(`${side.target}-activity-error`);
  await app.unroute(feedUrl);
  await app.getByRole("button", { name: "Try again" }).click();
  await wait(1500);
  expect("retried", await count(app), 11);

  await dev("activity/unread");
  await app.reload();
  await wait(2500);
  await app.route(readUrl, (r) => r.abort());
  await app.locator(".page .filters button", { hasText: "Server" }).click();
  await wait(400);
  await app.locator(".page .row", { hasText: "Server updated" }).click();
  await wait(300);
  out.afterFailure = { summary: await summary(app), dots: await app.locator(".page .row .dot.on").count(), toast: norm(await app.locator('[role="status"]').textContent()), bell: await bellState(app) };
  expect("failed read", [out.afterFailure.summary, out.afterFailure.dots, out.afterFailure.bell.label], ["11 unread", 3, "Activity, 11 unread"]);
  if (!out.afterFailure.toast.includes("That didn’t save. Try again.")) throw new Error(`toast: ${out.afterFailure.toast}`);
  await shot(`${side.target}-activity-unsaved`);
  return out;
}

export async function realTime(ctx, side) {
  const { app, wait } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  await side.open(ctx);
  await wait(1500);
  await bell(app).click();
  await wait(1500);
  const out = { shown: await count(app), summary: await summary(app) };
  expect("real clock feed", [out.shown, out.summary], [11, "3 unread"]);
  await app.route("**/api/v1/activity/read", (r) => r.abort());
  await app.getByRole("button", { name: "Mark all as read" }).click();
  await wait(800);
  out.toast = norm(await app.locator('[role="status"]').textContent());
  out.after = { summary: await summary(app), bell: await bellState(app) };
  expect("unsaved", [out.after.summary, out.after.bell.dot], ["3 unread", 1]);
  if (!out.toast.includes("That didn’t save. Try again.")) throw new Error(`toast: ${out.toast}`);
  await app.unroute("**/api/v1/activity/read");
  await app.getByRole("button", { name: "Mark all as read" }).click();
  await wait(1000);
  out.read = { summary: await summary(app), bell: await bellState(app) };
  expect("read", [out.read.summary, out.read.bell.dot], ["All caught up", 0]);
  return out;
}
