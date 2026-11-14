// The halts on the desktop player. Expected: each kind the server or the network can force shows its eyebrow, title,
// note or countdown and actions over the blurred frame, the panel and the bar go away, and the place is kept; "Try now"
// with the server back resumes where the viewer was; "Back to {title}" leaves the player and stops the session.
import { fake, jump, mockArgs, open, prepare, target, where } from "./player-lib.mjs";

export { mockArgs, target };

const stopped = JSON.stringify({ error: { code: "session_stopped", message: "Need the bandwidth for a backup. Back in about 20 minutes.", by: "Maya Lindqvist" } });
const KINDS = {
  stop: stopped,
  restart: JSON.stringify({ error: { code: "server_restarting", message: "Installing an update.", by: "Maya Lindqvist", retry_after: 60 } }),
  busy: JSON.stringify({ error: { code: "transcode_limit", message: "busy", retry_after: 60 } }),
  nocodec: JSON.stringify({ error: { code: "transcode_unavailable", message: "its GPU doesn’t handle it" } }),
  missing: JSON.stringify({ error: { code: "file_not_found", message: "/media/movies/Dune (2021)/Dune.2021.2160p.mkv" } }),
  unreachable: "error sending request for url (http://127.0.0.1:8081/api/v1/playback/sessions)",
  offline: "error sending request for url (http://127.0.0.1:8081/api/v1/playback/sessions)",
};

export default async (ctx) => {
  const { app, shot, wait } = ctx;
  await prepare(ctx);
  const out = {};
  const summary = () => app.evaluate(() => {
    const h = document.querySelector(".halt");
    if (!h) return null;
    const t = (s) => h.querySelector(s)?.innerText.replace(/\s+/g, " ").trim() ?? null;
    return {
      eyebrow: t(".eyebrow")?.toLowerCase() ?? null,
      title: t(".halt .title"),
      body: t(".halt .body"),
      mono: t(".mono"),
      message: t(".msg-text"),
      noReason: t(".no-msg"),
      count: t(".count-text"),
      wait: t(".wait"),
      alts: [...h.querySelectorAll(".alt")].map((a) => a.innerText.replace(/\s+/g, " ").trim()),
      note: t(".halt .note"),
      actions: [...h.querySelectorAll(".actions button")].map((b) => b.innerText.trim()),
      chrome: Number(getComputedStyle(document.querySelector(".chrome")).opacity),
      menus: document.querySelectorAll("[data-menu-panel]").length,
    };
  });
  // A page opened under the pointer sees no move to the point it already sits on, so each reveal goes somewhere new.
  let nudge = 0;
  const reveal = async () => {
    nudge += 13;
    await app.mouse.move(300 + nudge, 300 + nudge);
    await app.mouse.move(310 + nudge, 310 + nudge);
    await wait(500);
  };
  const force = async (kind) => {
    await open(ctx, "/player/movies/1");
    await reveal();
    await jump(ctx, 500);
    await app.evaluate(({ raw, offline }) => {
      if (offline) Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      window.__failStart = raw;
    }, { raw: KINDS[kind], offline: kind === "offline" });
    await reveal();
    await app.locator('.bottom button[aria-label="Quality"]').click();
    await wait(500);
    await app.locator("[data-menu-panel] .opt", { hasText: "4 Mbit/s" }).click();
    await wait(1200);
  };

  for (const kind of Object.keys(KINDS)) {
    await force(kind);
    out[kind] = await summary();
    await shot(`desk-player-halt-${kind}`);
    // Leaving cleanly: a page dropped mid-session leaves requests the single-threaded bridge keeps waiting on.
    await app.locator(".halt .secondary").last().click();
    await wait(800);
  }

  await force("unreachable");
  const loadsBefore = await app.evaluate(() => window.__fake.loads.length);
  const startsBefore = await app.evaluate(() => window.__calls.filter((c) => c === "start_session").length);
  await app.evaluate(() => { window.__failStart = null; });
  await app.locator(".halt .primary").click();
  await wait(1500);
  out.retry = await app.evaluate((n) => ({ halt: !!document.querySelector(".halt"), loads: window.__fake.loads.slice(n), playing: window.__fake.p.playing, starts: window.__calls.filter((c) => c === "start_session").length }), loadsBefore);
  out.retry.newSession = out.retry.starts - startsBefore;
  await app.keyboard.press("Escape");
  await wait(800);

  await force("stop");
  await app.locator(".halt .secondary").last().click();
  await wait(1500);
  out.back = { url: await where(app), stopped: await app.evaluate(() => window.__calls.includes("stop_session")), playing: (await fake(app)).playing };
  // Going back to a page that was left mid-play aborts its in-flight session calls, which WebKit reports as page errors.
  out.pageErrors = ctx.log.filter((l) => l.startsWith("PAGEERR") && !/\/sessions\/[0-9a-f]+ due to access control/.test(l));

  const ok =
    out.stop?.eyebrow === "playback stopped" && out.stop.title === "An admin stopped this stream" && out.stop.message?.includes("Need the bandwidth") && out.stop.note === "You were at 8:20. Your place is saved." && out.stop.actions.join() === "Try again,Back to Dune: Part Two" &&
    out.restart?.eyebrow === "server restarting" && out.restart.title === "Back in a few seconds" && out.restart.count?.startsWith("Reconnecting in") && out.restart.actions.join() === "Back to Dune: Part Two" &&
    out.busy?.eyebrow === "server busy" && out.busy.title === "Waiting for a free slot" && out.busy.count?.startsWith("Trying again in") && out.busy.actions[0] === "Try now" &&
    out.nocodec?.eyebrow === "can’t play here" && out.nocodec.actions.join() === "Back to Dune: Part Two" &&
    out.missing?.eyebrow === "file missing" && out.missing.mono?.includes("Dune.2021") && out.missing.actions.join() === "Back to Dune: Part Two" &&
    out.unreachable?.eyebrow === "can’t reach the server" && out.unreachable.count?.includes("your place is saved at 8:20") && out.unreachable.actions.join() === "Try now,Watch a download,Back to Dune: Part Two" &&
    out.offline?.eyebrow === "offline" && out.offline.wait?.includes("checking every 5 s") && out.offline.body?.endsWith("Your downloads still play.") && out.offline.actions.join() === "Try again,Watch a download,Back to Dune: Part Two" &&
    Object.values(out).slice(0, 7).every((h) => h && h.chrome === 0 && h.menus === 0) &&
    !out.retry.halt && out.retry.newSession >= 1 && out.retry.loads.at(-1)?.at >= 499 && out.retry.playing &&
    out.back.url.startsWith("/detail/movies/1") && out.back.stopped && !out.back.playing &&
    !out.pageErrors.length;
  if (!ok) throw new Error(JSON.stringify(out));
  return out;
};
