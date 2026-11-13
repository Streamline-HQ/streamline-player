// The browser picks an English subtitle while a real clip plays. Expected: the cue "Hello there" is drawn, the cue file
// was fetched from the engine's origin under /media/ with a signature, and the request carried no Authorization header.
import { engine, listen, playMovie, realClock, show, target, until } from "./web-play-lib.mjs";

export { engine, realClock, target };
export const mockArgs = ["--clip", `${process.env.MEDIA_DIR ?? "/tmp/streamline-player"}/multi.mkv`];

export default async (ctx) => {
  const { app, shot } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  const seen = listen(app);
  const files = [];
  app.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/media/")) files.push({ url: r.url(), auth: r.headers().authorization ?? null, key: r.headers()["x-api-key"] ?? null });
  });
  await playMovie(ctx);
  await until(app, "playing", (v) => v.ready >= 3 && !v.paused);
  await show(app);
  await app.locator('.bottom button[aria-label="Subtitles"]').click();
  await app.waitForTimeout(500);
  await app.locator("[data-menu-panel] .opt").nth(1).click();
  await app.waitForTimeout(500);
  await app.keyboard.press("Escape");
  await show(app);
  const track = await app.locator(".scrub").boundingBox();
  await app.mouse.click(track.x + track.width * 0.02, track.y + track.height / 2);
  const out = { cue: null };
  for (let i = 0; i < 60 && !out.cue; i++) {
    await app.waitForTimeout(200);
    out.cue = await app.locator(".cue").first().textContent().catch(() => null);
  }
  await shot("web-play-subtitle");
  out.file = files.find((f) => f.url.includes(".vtt"));
  out.calls = seen.calls.filter((c) => c.includes("/subtitles/"));
  const origin = out.file && new URL(out.file.url);
  const ok = out.cue === "Hello there" && origin?.port === "8097" && origin.searchParams.get("sig") && !out.file.auth && !out.file.key && !out.calls.length;
  if (!ok) throw new Error(JSON.stringify(out));
  return out;
};
