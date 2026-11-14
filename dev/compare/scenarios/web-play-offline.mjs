// The browser loses its network mid-play. Expected: the "Offline" halt says nothing about downloads and offers none,
// because the browser has none: its actions are "Try again" and "Back to {title}".
import { engine, mockArgs, playMovie, realClock, show, target, until } from "./web-play-lib.mjs";

export { engine, mockArgs, realClock, target };

export default async (ctx) => {
  const { app, ctx: browser, shot } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  await playMovie(ctx);
  await until(app, "playing", (v) => v.ready >= 3 && !v.paused && v.at > 2);
  await browser.route(/127\.0\.0\.1:8097/, (route) => route.abort());
  await app.evaluate(() => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }));
  await show(app);
  const track = await app.locator(".scrub").boundingBox();
  await app.mouse.click(track.x + track.width * 0.85, track.y + track.height / 2);
  let halt = null;
  for (let i = 0; i < 150 && !halt; i++) {
    await app.waitForTimeout(200);
    halt = await app.evaluate(() => {
      const h = document.querySelector(".halt");
      return h ? { eyebrow: h.querySelector(".eyebrow")?.innerText.trim().toLowerCase(), body: h.querySelector(".body")?.innerText.trim(), actions: [...h.querySelectorAll(".actions button")].map((b) => b.innerText.trim()) } : null;
    });
  }
  await shot("web-play-offline");
  const out = { halt };
  const ok = halt?.eyebrow === "offline" && !/download/i.test(halt.body ?? "") && halt.actions.length === 2 && !halt.actions.some((a) => /download/i.test(a));
  if (!ok) throw new Error(JSON.stringify(out));
  return out;
};
