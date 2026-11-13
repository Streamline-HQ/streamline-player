// The engine stops answering mid-play. Expected: the recovery runs, then the "Can't reach the server" halt with the
// place kept; unblocking and "Try now" resumes within 3 s of that place.
import { engine, mockArgs, playMovie, realClock, show, target, until, video } from "./web-play-lib.mjs";

export { engine, mockArgs, realClock, target };

export default async (ctx) => {
  const { app, ctx: browser, shot } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  await playMovie(ctx);
  await until(app, "playing", (v) => v.ready >= 3 && !v.paused && v.at > 2);
  const out = {};
  const block = (route) => route.abort();
  await browser.route(/127\.0\.0\.1:8097/, block);
  // Only what is not buffered yet fails, so jump past it.
  await show(app);
  const track = await app.locator(".scrub").boundingBox();
  await app.mouse.click(track.x + track.width * 0.85, track.y + track.height / 2);
  let halt = null;
  for (let i = 0; i < 150 && !halt; i++) {
    await app.waitForTimeout(200);
    halt = await app.evaluate(() => {
      const h = document.querySelector(".halt");
      return h ? { eyebrow: h.querySelector(".eyebrow")?.innerText.trim().toLowerCase(), actions: [...h.querySelectorAll(".actions button")].map((b) => b.innerText.trim()) } : null;
    });
  }
  out.halt = halt;
  await shot("web-play-drop");
  const place = await app.evaluate(() => document.querySelector(".halt .note, .halt .count-text")?.innerText ?? null);
  out.note = place;
  await browser.unroute(/127\.0\.0\.1:8097/, block);
  await app.getByRole("button", { name: "Try now" }).click();
  const back = await until(app, "resume after Try now", (v) => !v.paused && v.ready >= 3, 25);
  const target85 = back.duration * 0.85;
  out.resumedAt = { jumpedTo: Number(target85.toFixed(1)), at: Number(back.at.toFixed(1)) };
  const ok = out.halt?.eyebrow === "can’t reach the server" && out.halt.actions.includes("Try now") && Math.abs(back.at - target85) <= 3;
  if (!ok) throw new Error(JSON.stringify(out));
  return out;
};
