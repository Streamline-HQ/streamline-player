// The Downloads scenarios. The desktop target's shim fakes the Rust queue (window.__shim.downloads); the web target has none.
import { targets } from "./browse-lib.mjs";
import { signInWithSso } from "./web-lib.mjs";

export { targets, signInWithSso };

export const pathOf = (app) => app.evaluate(() => location.pathname + location.search);
export const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
export const bar = (app) => app.locator('.bar .actions button[aria-label="Downloads"]');
export const toastText = (app) => app.locator('[role="status"]').textContent().then(norm);

export function expect(what, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}

const entry = (id, kind, title, o) => {
  const series = kind === "series";
  const size = o.size ?? 1.8e9;
  const state = o.state ?? "done";
  const progress = o.progress ?? (state === "done" ? 1 : 0);
  return {
    key: series ? `series:${id}:${o.season}:${o.episode}` : `movies:${id}`,
    media_id: `dl-${kind}-${id}-${o.season ?? 0}-${o.episode ?? 0}`,
    quality: o.quality ?? "1080p",
    audio: [{ index: 0, language: "en", codec: "eac3", converted: false }],
    subtitles: [],
    state,
    progress,
    bytes: Math.round(size * progress),
    size,
    error: null,
    added_at: "2026-11-12T10:00:00Z",
    meta: {
      kind,
      title_id: id,
      title,
      year: series ? null : 2024,
      runtime: series ? 48 : 119,
      season: o.season ?? null,
      episode: o.episode ?? null,
      episode_title: series ? `Episode ${o.episode}` : null,
      poster: `${kind}/${id}/poster.jpg`,
      still: `${kind}/${id}/backdrop.jpg`,
    },
    watched: o.watched ?? false,
    offline: o.offline ?? null,
  };
};
const ep = (id, title, season, episode, o = {}) => entry(id, "series", title, { season, episode, ...o });

// The design's sample set on the mock's titles: 11 ready, 2 in progress.
export const sample = () => [
  ep(1, "Severance", 1, 1, { size: 1.8e9 }),
  ep(1, "Severance", 1, 2, { size: 1.5e9, watched: true }),
  ep(1, "Severance", 2, 1, { size: 1.7e9 }),
  ep(1, "Severance", 2, 2, { size: 1.8e9 }),
  ep(1, "Severance", 2, 3, { size: 1.7e9 }),
  ep(1, "Severance", 2, 4, { size: 1.6e9, state: "downloading", progress: 0.46 }),
  ep(4, "Arcane", 2, 3, { size: 1.1e9, state: "queued", quality: "720p" }),
  ep(2, "Shōgun", 1, 1, { size: 2.0e9 }),
  ep(2, "Shōgun", 1, 2, { size: 1.9e9 }),
  ep(2, "Shōgun", 1, 3, { size: 2.0e9, offline: { position: 2040, done: false, at: "2026-11-12T12:00:00Z" } }),
  ep(3, "The Last of Us", 1, 3),
  ep(3, "The Last of Us", 2, 1, { offline: { position: 0, done: true, at: "2026-11-12T12:00:00Z" } }),
  entry(3, "movies", "Alien: Romulus", { size: 4.2e9 }),
];

export const STORAGE = [21.9e9, 612.4e9, 341.8e9];

export const seed = (app, entries = sample(), rate = 5e6) =>
  app.evaluate(([e, r, s]) => { window.__shim.downloads.storage(...s); window.__shim.downloads.seed(e, r); }, [entries, rate, STORAGE]);
export const advance = (app, bytes) => app.evaluate((b) => window.__shim.downloads.advance(b), bytes);
export const shimLog = (app) => app.evaluate(() => JSON.parse(JSON.stringify(window.__shim.downloads.log)));
export const shimItems = (app) => app.evaluate(() => window.__shim.downloads.items);

export const rows = (app) => app.locator(".page .active .row").evaluateAll((els) =>
  els.map((r) => ({
    key: r.dataset.key,
    cls: r.dataset.state,
    title: r.querySelector(".name").textContent.trim(),
    pct: r.querySelector(".fill").style.width,
    sub: r.querySelector(".sub").textContent.trim(),
    note: r.querySelector(".note").textContent.trim(),
    retry: r.querySelectorAll("button:not(.sl-btn--icon)").length,
  })),
);
export const groups = (app) => app.locator(".page .done .group").evaluateAll((els) =>
  els.map((g) => ({
    name: g.querySelector(".gname").textContent.trim(),
    sub: g.querySelector(".gsub").textContent.trim(),
    removeAll: !!g.querySelector(".head .sl-btn--destructive"),
    seasons: [...g.querySelectorAll(".season")].map((s) => ({
      label: s.querySelector(".label")?.textContent.trim() ?? null,
      cards: [...s.querySelectorAll(".card")].map((c) => c.dataset.key),
    })),
  })),
);
export const summary = (app) => app.locator(".page .summary").textContent().then(norm);
export const dots = (app) => bar(app).locator(".sl-btn__dot").count();

export async function openFromHome(ctx, entries) {
  const { app, wait } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  await app.goto("http://localhost:1440/");
  await wait(2500);
  if (entries !== null) await seed(app, entries);
  await wait(500);
}

export async function page(ctx) {
  const { app, shot, wait } = ctx;
  await openFromHome(ctx);
  const out = {};
  out.home = { dots: await dots(app), on: await bar(app).evaluate((el) => el.classList.contains("on")) };
  expect("home dot", out.home, { dots: 1, on: false });
  await shot("desk-downloads-home");
  await bar(app).click();
  await wait(1500);
  expect("button lands", await pathOf(app), "/downloads");
  expect("button active", await bar(app).evaluate((el) => el.classList.contains("on")), true);
  out.heading = norm(await app.locator(".page h1").textContent());
  out.summary = await summary(app);
  expect("heading", [out.heading, out.summary], ["Downloads", "11 ready · 2 in progress"]);
  out.meter = await app.locator(".page .legend span").allTextContents();
  expect("meter", out.meter, ["21.9 GB Streamline", "612.4 GB other", "341.8 GB free"]);
  out.sections = await app.locator(".page section h2").allTextContents();
  expect("sections", out.sections, ["Downloading", "On this device"]);
  out.rows = await rows(app);
  expect("two rows", out.rows.length, 2);
  expect("first row", [out.rows[0].title, out.rows[0].pct, out.rows[0].sub, out.rows[0].cls], ["Severance · S2 E4", "46%", "1080p · 0.74 of 1.6 GB", "downloading"]);
  if (!/^\d+(\.\d)? MB\/s · .+ left$/.test(out.rows[0].note)) throw new Error(`rate: ${out.rows[0].note}`);
  expect("second row", [out.rows[1].title, out.rows[1].note, out.rows[1].sub], ["Arcane · S2 E3", "Queued · #1", "720p · 0.00 of 1.1 GB"]);
  out.groups = await groups(app);
  expect("group names", out.groups.map((g) => g.name), ["Movies", "Severance", "Shōgun", "The Last of Us"]);
  expect("group subs", out.groups.map((g) => g.sub), ["1 · 4.2 GB", "5 episodes · 8.5 GB", "3 episodes · 5.9 GB", "2 episodes · 3.6 GB"]);
  expect("remove all", out.groups.map((g) => g.removeAll), [false, true, true, true]);
  expect("seasons", out.groups[1].seasons.map((s) => s.label), ["Season 1 · 2 episodes · 3.3 GB", "Season 2 · 3 episodes · 5.2 GB"]);
  out.posters = await app.evaluate(() => [...document.querySelectorAll(".page img")].filter((i) => i.offsetParent !== null && !i.complete).length);
  await shot("desk-downloads");
  const card = (key) => app.locator(`.page .card[data-key="${key}"]`);
  out.card = {
    head: norm(await card("series:1:1:2").locator(".head1").textContent()),
    meta: norm(await card("series:1:1:2").locator(".mono").first().textContent()),
    tracks: norm(await card("series:1:1:2").locator(".mono").nth(1).textContent()),
    off: norm(await card("series:2:1:3").locator(".off").textContent()),
    offDone: norm(await card("series:3:2:1").locator(".off").textContent()),
    movie: norm(await card("movies:3").locator(".line1").textContent()),
  };
  expect("card", out.card, {
    head: "E2 · Episode 2",
    meta: "1080p · 1.5 GB · watched",
    tracks: "Audio: English · Subtitles: none",
    off: "Watched to 34:00 offline · syncs when you’re back online",
    offDone: "Finished offline · syncs when you’re back online",
    movie: "2024 · 1h 59m",
  });

  await card("series:1:1:1").locator(".still").click();
  await wait(1500);
  out.playUrl = await pathOf(app);
  if (!/^\/player\/series\/1\?ep=\d+$/.test(out.playUrl)) throw new Error(`play url ${out.playUrl}`);
  await app.goBack();
  await wait(2500);
  await card("movies:3").locator(".still").click();
  await wait(1500);
  expect("movie play", await pathOf(app), "/player/movies/3");
  await app.goBack();
  await wait(2500);
  await card("series:1:1:1").locator(".text").click();
  await wait(1500);
  expect("card text", await pathOf(app), "/detail/series/1?s=1");
  await app.goBack();
  await wait(2500);
  await app.locator('.page .group button[aria-label="Open Shōgun"]').click();
  await wait(1500);
  expect("show poster", await pathOf(app), "/detail/series/2?s=1");
  await app.goBack();
  await wait(2500);

  await advance(app, 1e8);
  await wait(600);
  out.advanced = (await rows(app))[0];
  expect("advanced", [out.advanced.pct, out.advanced.sub], ["52%", "1080p · 0.84 of 1.6 GB"]);
  await advance(app, 2e9);
  await wait(900);
  out.finished = { summary: await summary(app), rows: await rows(app), toast: await toastText(app), season: (await groups(app))[1].seasons[1].label };
  expect("finished", [out.finished.summary, out.finished.rows.length, out.finished.rows[0].note, out.finished.toast, out.finished.season],
    ["12 ready · 1 in progress", 1, "Starting…", "Available offline · Severance S2 E4", "Season 2 · 4 episodes · 6.8 GB"]);
  await shot("desk-downloads-finished");

  await app.locator('.page .active .row button[aria-label="Cancel download"]').click();
  await wait(600);
  out.cancelled = { toast: await toastText(app), dots: await dots(app), rows: (await rows(app)).length };
  expect("cancelled", out.cancelled, { toast: "Download cancelled", dots: 0, rows: 0 });
  expect("cancel logged", (await shimLog(app)).filter((l) => l.call === "remove"), [{ call: "remove", keys: ["series:4:2:3"] }]);

  await card("series:3:1:3").locator('button[aria-label="Remove download"]').click();
  await wait(600);
  out.removed = { toast: await toastText(app), left: await card("series:3:1:3").count(), summary: await summary(app) };
  expect("removed", out.removed, { toast: "Removed from this device", left: 0, summary: "11 ready · 0 in progress" });

  const shogun = app.locator(".page .group", { hasText: "Shōgun" });
  await shogun.locator(".sl-btn--destructive").click();
  await wait(600);
  const dialog = app.getByRole("dialog");
  out.ask = { title: await dialog.getAttribute("aria-label"), body: norm(await dialog.locator(".body").textContent()) };
  expect("ask", out.ask, { title: "Remove Shōgun?", body: "3 episodes · 5.9 GB come off this device. You can download them again any time." });
  await shot("desk-downloads-ask");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await wait(600);
  expect("cancel keeps", (await groups(app)).length, 4);
  await shogun.locator(".sl-btn--destructive").click();
  await wait(600);
  await dialog.getByRole("button", { name: "Remove all" }).click();
  await wait(900);
  out.groupGone = { names: (await groups(app)).map((g) => g.name), toast: await toastText(app) };
  expect("group gone", out.groupGone, { names: ["Movies", "Severance", "The Last of Us"], toast: "Shōgun removed from this device" });
  const removed = (await shimLog(app)).filter((l) => l.call === "remove").at(-1);
  expect("group removed keys", removed.keys, ["series:2:1:1", "series:2:1:2", "series:2:1:3"]);
  return out;
}

// The same queue with a library that holds no titles: every row and card still draws from what it saved.
// The harness cannot serve the pictures a real download keeps on disk, so only the text and the layout are checked here.
export async function gone(ctx) {
  const { app, shot, wait } = ctx;
  await openFromHome(ctx);
  await bar(app).click();
  await wait(2000);
  const out = { summary: await summary(app), groups: (await groups(app)).map((g) => g.name), rows: (await rows(app)).map((r) => r.title) };
  expect("draws", out, { summary: "11 ready · 2 in progress", groups: ["Movies", "Severance", "Shōgun", "The Last of Us"], rows: ["Severance · S2 E4", "Arcane · S2 E3"] });
  await shot("desk-downloads-library-gone");
  return out;
}

export async function activityRow(ctx) {
  const { app, wait } = ctx;
  await openFromHome(ctx);
  await app.locator('.bar .actions button[aria-label^="Activity"]').click();
  await wait(1500);
  await app.locator(".page .filters button", { hasText: "Downloads" }).click();
  await wait(400);
  await app.locator(".page .row").first().click();
  await wait(1500);
  const out = { path: await pathOf(app) };
  expect("download row", out.path, "/downloads");
  return out;
}

export async function empty(ctx) {
  const { app, shot, wait } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  await app.goto("http://localhost:1440/");
  await wait(2500);
  await app.evaluate((s) => window.__shim.downloads.storage(...s), STORAGE);
  const out = { dots: await dots(app) };
  expect("no dot", out.dots, 0);
  await bar(app).click();
  await wait(1500);
  out.summary = await summary(app);
  out.title = norm(await app.locator(".page .empty .title").textContent());
  out.text = norm(await app.locator(".page .empty .text").textContent());
  out.meter = await app.locator(".page .legend span").allTextContents();
  expect("empty page", [out.summary, out.title, out.text, out.meter],
    ["0 ready · 0 in progress", "Nothing downloaded yet", "Tap the download icon on a movie or episode to watch it without a connection.", ["21.9 GB Streamline", "612.4 GB other", "341.8 GB free"]]);
  expect("no sections", await app.locator(".page section").count(), 0);
  await shot("desk-downloads-empty");
  await app.getByRole("button", { name: "Browse the library" }).click();
  await wait(1500);
  expect("browse", await pathOf(app), "/library/movies");
  return out;
}

export async function errors(ctx) {
  const { app, shot, wait } = ctx;
  await openFromHome(ctx);
  await bar(app).click();
  await wait(1500);
  const out = {};
  await app.evaluate(() => window.__shim.downloads.fail("series:1:2:4", "no_space"));
  await wait(600);
  out.failed = (await rows(app)).map((r) => ({ cls: r.cls, pct: r.pct, note: r.note, retry: r.retry }));
  expect("no space", out.failed[0], { cls: "failed", pct: "46%", note: "Not enough space on this computer", retry: 1 });
  expect("next started", [out.failed[1].cls, out.failed[1].note], ["starting", "Starting…"]);
  const color = await app.locator(".page .active .row.failed .fill").evaluate((el) => getComputedStyle(el).backgroundColor);
  const red = await app.evaluate(() => { const s = document.createElement("i"); s.style.color = "var(--status-failed)"; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; });
  expect("red bar", color, red);
  await shot("desk-downloads-failed");
  await app.getByRole("button", { name: "Retry" }).click();
  await wait(600);
  expect("retry logged", (await shimLog(app)).filter((l) => l.call === "retry"), [{ call: "retry", key: "series:1:2:4" }]);
  out.retried = (await rows(app))[0];
  expect("retried", [out.retried.cls, out.retried.note], ["queued", "Queued · #1"]);
  await app.evaluate(() => window.__shim.downloads.fail("series:4:2:3", "prepare_failed"));
  await wait(600);
  out.prepare = (await rows(app)).find((r) => r.key === "series:4:2:3").note;
  expect("prepare failed", out.prepare, "The server couldn’t prepare it");
  return out;
}

export async function realTime(ctx) {
  const { app, wait, log } = ctx;
  await openFromHome(ctx, sample().slice(0, 7));
  await bar(app).click();
  await wait(1500);
  await app.evaluate(() => { window.__tick = setInterval(() => window.__shim.downloads.advance(4e7), 450); });
  const widths = [];
  for (let i = 0; i < 8; i++) {
    widths.push(await app.locator(".page .active .row .fill").first().evaluate((el) => parseFloat(el.style.width)));
    await wait(400);
  }
  await app.evaluate(() => clearInterval(window.__tick));
  const grew = widths.filter((w, i) => i > 0 && w > widths[i - 1]).length;
  const out = { widths, grew, drawn: await app.locator(".page h1").textContent(), errors: log.length };
  if (grew < 2) throw new Error(`bar grew ${grew} times: ${widths}`);
  expect("drawn", [out.drawn, out.errors], ["Downloads", 0]);
  return out;
}

export async function web(ctx) {
  const { app, shot, wait } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  const calls = [];
  app.on("request", (r) => ["fetch", "xhr"].includes(r.resourceType()) && /\/downloads/.test(new URL(r.url()).pathname) && calls.push(r.url()));
  await signInWithSso(app, wait);
  const out = {};
  out.bar = await app.locator('.bar .actions button[aria-label="Downloads"]').count();
  expect("no bar button", out.bar, 0);
  const anywhere = (re) => app.evaluate((src) => [...document.querySelectorAll("button, a, [aria-label]")].filter((e) => new RegExp(src, "i").test(e.getAttribute("aria-label") ?? e.textContent ?? "")).length, re.source);
  for (const path of ["/library/movies", "/library/series", "/detail/movies/1", "/detail/series/1"]) {
    await app.goto(`http://localhost:1430${path}`);
    await wait(2500);
    out[path] = await anywhere(/download/);
    expect(`${path} has no download control`, out[path], 0);
  }
  await shot("web-no-downloads-detail");
  await app.goto("http://localhost:1430/settings");
  await wait(2500);
  out.settings = await app.getByText("Downloads", { exact: true }).count();
  expect("no settings section", out.settings, 0);
  await app.keyboard.press("?");
  await wait(600);
  out.sheet = await app.getByRole("dialog").getByText("Downloads").count();
  expect("shortcuts", out.sheet, 0);
  await app.keyboard.press("Escape");
  await app.goto("http://localhost:1430/downloads");
  await wait(2500);
  out.landing = await app.evaluate(() => location.pathname);
  expect("downloads lands on home", out.landing, "/");
  expect("no request", calls, []);
  return out;
}

// Tracks the harness gives every title in place of the clip's own, so the picker's rows do not depend on which clip a title plays.
const sub = (index, codec, language, forced = false) => ({ index, codec, language, forced, sdh: false, files: { vtt: `fake:${language}` } });
export const TRACKS = {
  video: { codec: "hevc", width: 3840, height: 2076, profile: "Main 10", hdr: "hdr10" },
  audio: [
    { index: 1, codec: "truehd", channels: 8, language: "eng", default: true },
    { index: 2, codec: "eac3", channels: 6, language: "jpn", default: false },
    { index: 3, codec: "aac", channels: 2, language: "fre", default: false },
  ],
  subtitles: [sub(4, "subrip", "eng"), sub(5, "ass", "jpn"), sub(6, "hdmv_pgs_subtitle", "fre"), sub(7, "dvd_subtitle", "fre")],
};

// The picker, the popover and the shim's queue as the start scenarios drive them.
export function starting(ctx) {
  const { app, wait } = ctx;
  const dlg = () => app.locator('[role="dialog"][aria-modal="true"]');
  const pop = () => app.locator('.dl-pop [role="dialog"]');
  const toast = async () => ({
    title: norm(await app.locator('[role="status"] .sl-toast__title').textContent()),
    text: norm((await app.locator('[role="status"] .sl-toast__text').textContent().catch(() => "")) ?? ""),
  });
  const starts = async () => (await shimLog(app)).filter((l) => l.call === "start");
  const removes = async () => (await shimLog(app)).filter((l) => l.call === "remove");
  const advance = (bytes) => app.evaluate((b) => window.__shim.downloads.advance(b), bytes);
  const finish = async () => { for (let i = 0; i < 12; i++) await advance(1e12); await wait(400); };
  const confirm = () => dlg().getByRole("button", { name: "Download", exact: true });
  const items = () => app.evaluate(() => window.__shim.downloads.items);
  const clear = () => app.evaluate(([e, s]) => { window.__shim.downloads.storage(...s); window.__shim.downloads.seed(e, 0); }, [[], STORAGE]);
  return { dlg, pop, toast, starts, removes, advance, finish, confirm, items, clear };
}

export async function withTracks(ctx, prepare) {
  await prepare(ctx);
  await ctx.app.addInitScript((t) => { window.__tracks = { ...window.__tracks, ...t }; }, TRACKS);
  await ctx.app.setViewportSize({ width: 1440, height: 900 });
}
