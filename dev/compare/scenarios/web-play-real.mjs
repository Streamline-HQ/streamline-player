// The browser plays a real HLS stream from the engine through Shaka. Expected: within 20 s the <video> is ready, has a
// picture and its time rises with the wall clock and agrees with the player's clock; pause holds it; a click on the
// scrubber lands near the middle and playback continues; the volume slider reaches the element; the stats panel names
// Shaka and shows a throughput and a buffer. The capabilities sent to the server and the session's mode are recorded: a
// browser that cannot decode the HEVC clip must be served a conversion, and still plays it.
import { engine, listen, mockArgs, playMovie, realClock, show, target, until, video } from "./web-play-lib.mjs";

export { engine, mockArgs, realClock, target };

const clock = (text) => {
  const m = /^(?:(\d+):)?(\d+):(\d+)/.exec(text ?? "");
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};

export default async (ctx) => {
  const { app, shot, engine: name, log } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  const seen = listen(app);
  const out = {};
  await playMovie(ctx);

  const first = await until(app, "ready", (v) => v.ready >= 3 && !v.paused);
  out.ready = { width: first.width };
  const a = (await video(app)).at;
  await app.waitForTimeout(4000);
  const b = await video(app);
  out.rise = Number((b.at - a).toFixed(2));
  await show(app);
  out.clock = clock(await app.locator(".bar .time").first().innerText());
  out.clockOff = Math.abs((out.clock ?? -99) - b.at);
  await shot("web-play-real");

  await app.locator(".bar .big").click();
  await app.waitForTimeout(600);
  const held = (await video(app)).at;
  await app.waitForTimeout(1200);
  const stopped = await video(app);
  out.paused = { held: stopped.at === held, paused: stopped.paused };

  const track = await app.locator(".scrub").boundingBox();
  await app.mouse.click(track.x + track.width * 0.5, track.y + track.height / 2);
  const half = b.duration / 2;
  const landed = await until(app, "seek", (v) => Math.abs(v.at - half) <= 3 && v.ready >= 2, 20);
  out.seek = { half, at: Number(landed.at.toFixed(1)) };
  await app.locator(".bar .big").click();
  await until(app, "resume after seek", (v) => !v.paused && v.at - landed.at >= 1.5, 15);
  out.resumed = true;

  await show(app);
  const slider = await app.locator(".vol .slider").boundingBox();
  const before = (await video(app)).volume;
  await app.mouse.click(slider.x + slider.width * 0.4, slider.y + slider.height / 2);
  await app.waitForTimeout(400);
  out.volume = { before, after: Number((await video(app)).volume.toFixed(2)) };

  await app.keyboard.press("i");
  await app.waitForTimeout(1500);
  out.stats = await app.evaluate(() => Object.fromEntries([...document.querySelectorAll(".sl-stats .stats-row")].map((r) => [r.children[0].textContent.trim(), r.children[1].textContent.trim()])));
  await shot("web-play-real-stats");

  const answer = seen.answers[0];
  out.mode = answer && { mode: answer.mode, video: answer.video, audio: answer.audio };
  out.capabilities = seen.sessions[0]?.capabilities;
  out.console = log.filter((l) => !/favicon/i.test(l));

  const ok =
    out.ready.width > 0 && out.rise >= 2 && out.clockOff <= 1 &&
    out.paused.held && out.paused.paused &&
    Math.abs(out.seek.at - out.seek.half) <= 3 && out.resumed &&
    Math.abs(out.volume.after - 0.4) < 0.15 &&
    out.stats.Player?.startsWith("Shaka") && out.stats.Throughput && out.stats.Buffer &&
    out.mode;
  if (!ok) throw new Error(JSON.stringify(out));
  const claimsHevc = out.capabilities.video.some((v) => v.codec === "hevc");
  if (!claimsHevc && out.mode.video.action === "copy") throw new Error(`${name} cannot decode HEVC and was sent the clip as it is: ${JSON.stringify(out.mode)}`);
  out.claimsHevc = claimsHevc;
  return out;
};
