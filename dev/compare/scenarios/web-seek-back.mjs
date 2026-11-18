// The browser plays a real HLS stream, the scrubber is clicked ahead and then behind the playhead, and Left is
// pressed. Expected: each click lands where it was made, and Left goes ten seconds back from there.
import { engine, mockArgs, playMovie, realClock, show, target, until, video } from "./web-play-lib.mjs";

export { engine, mockArgs, realClock, target };

export default async (ctx) => {
  const { app } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  await playMovie(ctx);
  const first = await until(app, "ready", (v) => v.ready >= 3 && !v.paused);
  const out = {};
  const click = async (share) => {
    await show(app);
    const track = await app.locator(".scrub").boundingBox();
    await app.mouse.click(track.x + track.width * share, track.y + track.height / 2);
    const want = first.duration * share;
    const v = await until(app, `seek to ${share}`, (v) => Math.abs(v.at - want) <= 3 && v.ready >= 2, 20);
    return Number(v.at.toFixed(1));
  };
  out.ahead = await click(0.7);
  out.behind = await click(0.4);
  await app.keyboard.press("ArrowLeft");
  const back = await until(app, "ten seconds back", (v) => v.at < out.behind - 5 && v.ready >= 2, 10).catch(async (e) => {
    out.failed = String(e.message);
    return video(app);
  });
  out.afterLeft = Number(back.at.toFixed(1));
  out.focus = await app.evaluate(() => document.activeElement?.className ?? null);
  if (out.failed) throw new Error(`${out.failed} ${JSON.stringify(out)}`);
  return out;
};
