// The Server settings screen as an admin, on the desktop target (:1440 behind the Tauri shim) and on the web target (:1430, after SSO).
import { targets } from "./browse-lib.mjs";

export { targets };

const MOCK = "http://127.0.0.1:8081";
export const dev = (path) => fetch(`${MOCK}/dev/${path}`, { method: "POST" });
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const pathOf = (app) => app.evaluate(() => location.pathname);

export function expect(what, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}

export const text = async (loc) => norm(await loc.innerText());
const texts = (loc) => loc.evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
export const block = (app, title) => app.locator(".server .block").filter({ has: app.getByRole("heading", { name: title, exact: true, level: 3 }) });
const section = (app, key) => app.locator(`.server [data-sec="${key}"]`);
const navItem = (app, title) => app.locator("nav .item").filter({ hasText: title });
const content = (app) => app.locator(".content");

export async function openServer(ctx, side) {
  const { app, wait } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  await side.open(ctx);
  await wait(1500);
}

const adminWrites = (app) => {
  const writes = [];
  app.on("request", (r) => {
    if (r.method() !== "GET" && r.url().includes("/api/v1/admin/")) writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  return writes;
};

export async function server(ctx, side) {
  const { app, shot, wait } = ctx;
  const writes = adminWrites(app);
  await openServer(ctx, side);
  const out = { target: side.target };

  // Ways in.
  await app.goto(`${side.url}/settings`);
  await wait(1500);
  const entry = app.locator('.settings button.server');
  out.entry = { text: await text(entry), badge: await text(entry.locator(".badge")), ping: await entry.locator(".ms").count() };
  expect("settings entry", [out.entry.text.startsWith("Server"), out.entry.badge, out.entry.ping], [true, "1", 1]);
  expect("ping pill gone", await app.locator(".settings .ping").count(), 0);
  await shot(`${side.target}-server-entry`);
  await entry.click();
  await wait(2000);
  expect("entry lands", await pathOf(app), "/admin");
  if (side.target === "web") expect("page title", await app.title(), "Server settings");
  expect("home tab current", await text(app.locator(".bar .tab.on")), "Home");

  await app.goto(`${side.url}/`);
  await wait(1500);
  await app.locator("button.account").click();
  await wait(600);
  const item = app.locator('[role="menuitem"]').filter({ hasText: "Server settings" });
  out.menu = { badge: await text(item.locator(".sl-acct__badge")), keys: await item.locator(".sl-acct__keys").count() };
  expect("menu entry", out.menu, { badge: "1", keys: 0 });
  await shot(`${side.target}-server-menu`);
  await app.keyboard.press("Escape");
  await wait(500);
  await app.keyboard.press("g");
  await app.keyboard.press("a");
  await wait(2000);
  expect("G A lands", await pathOf(app), "/admin");
  await app.keyboard.press("?");
  await wait(700);
  const line = app.locator('[role="dialog"]').getByText("Server settings", { exact: true });
  out.shortcut = await text(line.locator("xpath=.."));
  expect("shortcut line", out.shortcut, "Server settings G A");
  await app.keyboard.press("Escape");
  await wait(500);
  await app.reload();
  await wait(2500);

  // Nav.
  out.heading = { title: await text(app.locator("nav h1")), host: (await text(app.locator("nav .host"))).length > 0 };
  expect("heading", out.heading, { title: "Server", host: true });
  expect("status dot", await app.locator("nav .host .dot").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(34, 197, 94)");
  out.back = await text(app.locator("nav .back"));
  expect("back label", out.back, "Your settings");
  out.nav = await app.locator("nav .group").evaluateAll((gs) =>
    gs.map((g) => ({
      name: g.querySelector(".name")?.textContent.trim() ?? "",
      items: [...g.querySelectorAll(".item")].map((i) => [i.querySelector(".title").textContent.trim(), i.querySelector(".badge, .count")?.textContent.trim() ?? "", i.classList.contains("on")]),
    })),
  );
  expect("nav", out.nav, [
    { name: "", items: [["Overview", "", true]] },
    { name: "Streaming", items: [["Now playing", "3", false], ["Devices", "1", false], ["Transcoding", "", false]] },
    { name: "Library", items: [["Library", "", false]] },
    { name: "System", items: [["Logs", "", false]] },
  ]);
  await shot(`${side.target}-server-overview`);

  // Overview.
  const tiles = (b) => b.locator(".tile").evaluateAll((els) => els.map((t) => [...t.querySelectorAll(".label, .value, .sub")].map((e) => e.textContent.trim())));
  out.now = await tiles(block(app, "Right now").or(app.locator(".server .block").filter({ hasText: "Right now" })).first());
  expect("now tiles", out.now, [
    ["Streams", "3", "1 transcoding · 29.9 Mbps out"],
    ["Pairing", "1", "iPad mini"],
    ["Media storage", "44%", "4.5 TB free of 8 TB"],
    ["Health", "All good", "ffmpeg 7.1 · VAAPI ready"],
  ]);
  const engine = app.locator(".server .block").filter({ hasText: "Public URL" }).first();
  out.engine = await tiles(engine);
  expect("engine tiles labels", out.engine.map((t) => t[0]), ["Public URL", "Data directory", "Database", "Transcode cache"]);
  expect("engine tiles subs", out.engine.map((t) => t[2]), ["Served over HTTPS", "620 GB free of 1 TB", "184 MB · same disk", "3.2 GB · 3 streams"]);
  const kvs = (b) => b.locator(".std").evaluateAll((els) => els.map((e) => [e.querySelector(".label").textContent.trim(), e.querySelector(".value")?.textContent.trim() ?? null]));
  out.build = await kvs(block(app, "Build & runtime"));
  expect("build rows", out.build.map((r) => r[0]), ["Version", "Go runtime", "Platform", "Commit", "Built", "Running"]);
  expect("version", out.build[0][1], "Streamline Server 2.4.1");
  const cfg = block(app, "Set in the config file");
  out.config = { rows: (await kvs(cfg)).map((r) => r[0]), desc: await text(cfg.locator("p")) };
  expect("config rows", out.config.rows, ["Bind address", "Trusted proxies", "Session secret", "Log sink"]);
  expect("config desc", out.config.desc.startsWith("Read-only here."), true);
  const tele = block(app, "Telemetry & retention");
  out.telemetry = await tele.locator("input").evaluateAll((els) => els.map((e) => [e.value, e.placeholder]));
  expect("telemetry fields", out.telemetry, [["", "localhost:4318"], ["2160h", "2160h"]]);
  expect("telemetry desc", await texts(tele.locator(".desc")), ["Collector for traces and metrics. Leave empty to turn export off.", "2160h is 90 days."]);
  const restart = block(app, "Restart");
  expect("restart block", [await restart.locator("h3.danger").count(), await text(restart.locator("button"))], [1, "Restart"]);

  // Scroll spy.
  await navItem(app, "Transcoding").click();
  await wait(1800);
  const top = await section(app, "transcoding").evaluate((el) => Math.round(el.getBoundingClientRect().top));
  expect("transcoding heading at the top", Math.abs(top - 92) <= 4, true);
  expect("transcoding marked", await text(app.locator("nav .item.on .title")), "Transcoding");
  await shot(`${side.target}-server-transcoding`);
  await content(app).evaluate((el) => el.scrollTo(0, 1e6));
  await wait(800);
  expect("bottom marks logs", await text(app.locator("nav .item.on .title")), "Logs");
  await content(app).evaluate((el) => el.scrollTo(0, 0));
  await wait(800);
  expect("top marks overview", await text(app.locator("nav .item.on .title")), "Overview");
  await app.locator(".tile", { hasText: "Streams" }).first().click();
  await wait(1800);
  expect("streams tile scrolls", await text(app.locator("nav .item.on .title")), "Now playing");

  // Now playing.
  const streams = block(app, "3 streams");
  const rows = await streams.locator(".stream").evaluateAll((els) =>
    els.map((r) => ({
      title: r.querySelector(".title").textContent.trim(),
      sub: r.querySelector(".sub").textContent.trim(),
      mode: r.querySelector(".mode").textContent.trim(),
      who: r.querySelector(".who").textContent.replace(/\s+/g, " ").trim(),
      path: r.querySelector(".path").textContent.trim(),
      time: r.querySelector(".time").textContent.trim(),
      mbps: r.querySelector(".mbps").textContent.trim(),
      stop: r.querySelector(".stop").getAttribute("aria-label"),
      paused: !!r.querySelector(".paused"),
    })),
  );
  out.streams = rows.map((r) => ({ ...r, time: undefined }));
  expect("stream titles", rows.map((r) => r.title), ["Severance", "Dune: Part Two", "Arcane"]);
  expect("severance", [rows[0].sub.startsWith("S2 E4 · "), rows[0].mode, rows[0].who.includes("Antoine Langlois (you)"), rows[0].path, rows[0].mbps, rows[0].stop], [true, "Original", true, "HEVC Main10 Dolby Vision · EAC3 Atmos 5.1 · sent as-is", "15.8 Mbps", "Stop Antoine’s stream"]);
  expect("dune", [rows[1].mode, rows[1].path, rows[1].stop], ["Transcoding", "HEVC Main10 HDR10 → H.264 1080p SDR · VAAPI · 2.1× realtime · this browser can’t decode HEVC", "Stop Camille’s stream"]);
  expect("arcane", [rows[2].mode, rows[2].path.endsWith("video sent as-is · this tablet can’t decode EAC3"), rows[2].paused, rows[0].paused], ["Audio transcoded", true, true, false]);
  await shot(`${side.target}-server-streams`);
  const t0 = rows.map((r) => r.time);
  await wait(3000);
  const t1 = await streams.locator(".stream .time").allTextContents();
  expect("playing row advances, paused row holds", [t1[0] !== t0[0], t1[2] === t0[2]], [true, true]);

  // Devices.
  expect("waiting block", await text(block(app, "Waiting for approval").locator("p")), "Check the code matches the one on the device. Codes expire after 10 minutes.");
  const pair = block(app, "Waiting for approval").locator(".pair");
  expect("pair row", [await text(pair.locator(".name")), await text(pair.locator(".code")), (await text(pair.locator(".sub"))).replace(/· [23] min ago$/, "· 2 min ago"), await pair.locator("button").allTextContents()], ["iPad mini", "R4W-X9P", "iPadOS · 2 min ago", ["Deny", "Approve"]]);
  await shot(`${side.target}-server-devices`);
  const items = (b) => b.locator(".item").evaluateAll((els) => els.map((r) => ({ title: r.querySelector(".title").textContent.trim(), pills: [...r.querySelectorAll(".pill")].map((p) => p.textContent.trim()), meta: r.querySelector(".meta").textContent.trim(), aside: r.querySelector(".aside")?.textContent.trim() ?? "", buttons: [...r.querySelectorAll("button")].map((b) => b.textContent.trim()) })));
  const apps = block(app, "Paired apps");
  out.apps = await items(apps);
  expect("apps desc", await text(apps.locator("p")), `${side.target === "desktop" ? 6 : 5} devices, each with its own key in the device’s secure storage.`);
  const pixel = out.apps.find((a) => a.title === "Pixel 9");
  expect("pixel", [pixel.meta, pixel.aside, pixel.buttons], ["Android · Camille Roux · Android Keystore", "3 days ago", ["Revoke"]]);
  expect("streaming device", out.apps.find((a) => a.title === "Living room · SHIELD").aside, "Streaming");
  const own = out.apps.find((a) => a.pills.length);
  const browsers = block(app, "Browser sessions");
  out.browsers = await items(browsers);
  expect("browsers desc", await text(browsers.locator("p")), "Signed in from a web browser.");
  const chrome = out.browsers.find((b) => b.meta.startsWith("Camille"));
  expect("chrome session", [chrome.meta, chrome.buttons], ["Camille Roux · expires in 6 days", ["End"]]);
  if (side.target === "desktop") expect("own app row", [own.title, own.pills, own.buttons], ["Desktop · app", ["This device"], []]);
  else {
    expect("own browser row", [out.browsers[0].pills, out.browsers[0].buttons], [["This browser"], []]);
    expect("no own app row", out.apps.some((a) => a.pills.length), false);
  }

  // Transcoding.
  const hw = block(app, "Hardware acceleration");
  expect("acceleration", [await texts(hw.locator(".std .label")), await texts(hw.locator("fieldset button")), await hw.locator('fieldset button[aria-pressed="true"]').textContent()], [["Acceleration", "Device", "Status"], ["Auto", "Off", "VAAPI"], "Auto"]);
  expect("device field", await hw.locator("input").evaluate((el) => [el.value, el.disabled]), ["/dev/dri/renderD128", false]);
  expect("status", [await text(hw.locator(".kv .value")), await text(hw.locator(".kv .pill"))], ["Intel UHD Graphics 770", "Ready"]);
  const live = block(app, "Live streams");
  expect("live rows", await texts(live.locator(".std .label")), ["Convert HDR for SDR screens", "Conversions at once", "ffmpeg"]);
  expect("tonemap on", await live.locator('[role="switch"]').getAttribute("aria-checked"), "true");
  expect("max live", await live.locator("input").inputValue(), "2");
  expect("ffmpeg", [await text(live.locator(".kv .value")), await text(live.locator(".kv .pill"))], ["/usr/bin/ffmpeg · 7.1", "Found"]);
  const cache = block(app, "Cache");
  expect("cache", [await texts(cache.locator(".std .label")), await texts(cache.locator(".std .desc")), await text(cache.locator("button"))], [["Location", "Clear the cache"], ["3.2 GB used by 3 streams."], "Clear"]);

  // Library.
  const folders = block(app, "Folders");
  out.folders = await items(folders);
  expect("folders", out.folders.map((f) => [f.title, f.meta, f.aside, f.buttons]), [["Movies", "/media/movies", "42 movies · 1.3 TB", ["Scan"]], ["Series", "/media/series", "28 shows · 2.2 TB", ["Scan"]]]);
  const last = await text(folders.locator(".kv"));
  expect("folder actions", [await text(folders.locator(".head .action")), /^Tue \d\d:\d\d · 4 new files · 2 replaced · 0 errors$/.test(last), await text(folders.locator(".std .label"))], ["Scan all", true, "Last scan"]);
  const scanning = block(app, "Scanning");
  expect("scanning rows", await texts(scanning.locator(".std .label")), ["Watch folders for changes", "Full scan every", "Read files with ffprobe"]);
  expect("scanning values", [await scanning.locator('[role="switch"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-checked"))), await text(scanning.locator('fieldset button[aria-pressed="true"]'))], [["true", "true"], "6 h"]);
  await shot(`${side.target}-server-library`);

  // Logs.
  const recent = block(app, "Recent");
  const lines = await recent.locator(".line").evaluateAll((els) => els.map((l) => [l.querySelector(".lv").textContent.trim(), getComputedStyle(l.querySelector(".lv")).color]));
  expect("nine log lines", lines.length, 9);
  expect("level colours differ", new Set(lines.map((l) => l[0])).size, new Set(lines.map((l) => l[1])).size);
  expect("log controls", [await texts(recent.locator("fieldset button")), await recent.locator(".live").getAttribute("aria-pressed"), await text(recent.locator(".live"))], [["All", "Warnings", "Errors"], "true", "Live"]);
  expect("log blocks", await texts(app.locator(".server h3")).then((t) => t.slice(-4)), ["Recent", "Application log", "Access log", "Rotation"]);
  expect("app log rows", await texts(block(app, "Application log").locator(".std .label")), ["Level", "Format", "Writes to"]);
  expect("access log rows", await texts(block(app, "Access log").locator(".std .label")), ["Format", "Writes to"]);
  expect("rotation rows", await texts(block(app, "Rotation").locator(".std .label")), ["Rotate at", "Files kept", "Compress rotated files"]);
  expect("footer", await text(app.locator(".server .foot")), "Streamline Server 2.4.1 · /etc/streamline/config.yaml");
  await content(app).evaluate((el) => el.scrollTo(0, 1e6));
  await wait(500);
  await shot(`${side.target}-server-logs`);

  expect("nothing written", writes, []);
  return out;
}
