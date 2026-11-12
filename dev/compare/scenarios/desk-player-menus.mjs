// The desktop player's panels and stats. Expected: each bar button opens its own panel at the bottom right, another
// button replaces it, a press outside or Escape closes it; Audio picks a track and steps the delay by 10 ms up to 500;
// Subtitles picks Off or a track, steps Sync by 0.1 s up to 10 s and restyles the cue; Quality and Speed show on their
// buttons; the stats pill and the I key open the stats panel and its close button shuts it.
import { fake, jump, mockArgs, open, prepare, shown, target, text } from "./player-lib.mjs";

export { mockArgs, target };

export default async (ctx) => {
  const { app, shot, wait, key } = ctx;
  await prepare(ctx);
  const out = {};
  await open(ctx, "/player/movies/2");
  await shown(ctx);
  await jump(ctx, 10);

  const button = (name) => app.locator(`.bottom button[aria-label="${name}"]`);
  const panels = () => app.locator("[data-menu-panel]").count();
  const panel = () => app.evaluate(() => {
    const el = document.querySelector("[data-menu-panel]");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { title: el.querySelector(".head .title")?.textContent.trim(), right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom), width: Math.round(r.width) };
  });
  const rows = () => app.evaluate(() => [...document.querySelectorAll("[data-menu-panel] .opt")].map((o) => ({ label: o.querySelector(".label")?.childNodes[0]?.textContent.trim(), sub: o.querySelector(".sub")?.textContent.trim() ?? null, badge: o.querySelector(".badge")?.textContent.trim() ?? null, on: o.classList.contains("sel"), disabled: o.disabled })));
  const calls = (name) => app.evaluate((n) => window.__calls.filter((c) => c === n).length, name);
  const step = (label, times) => app.evaluate(({ label, times }) => { const b = document.querySelector(`[data-menu-panel] button[aria-label="${label}"]`); for (let i = 0; i < times; i++) b.click(); }, { label, times });
  const stepper = () => text(app, "[data-menu-panel] .stepper .value");

  out.opens = {};
  for (const name of ["Subtitles", "Audio", "Quality", "Speed"]) {
    await button(name).click();
    await wait(500);
    out.opens[name] = await panel();
    await shot(`desk-player-menu-${name.toLowerCase()}`);
    await button(name).click();
    await wait(500);
  }
  out.closedByButton = await panels();

  await button("Subtitles").click();
  await wait(500);
  await button("Audio").click();
  await wait(600);
  out.replaced = { count: await panels(), title: (await panel())?.title };
  await app.mouse.click(400, 300);
  await wait(500);
  out.closedByPress = await panels();
  await key(" ");
  await button("Audio").click();
  await wait(500);
  await key("Escape");
  await wait(500);
  out.closedByEscape = { panels: await panels(), url: await app.evaluate(() => location.pathname) };

  await shown(ctx);
  await button("Audio").click();
  await wait(500);
  out.audioRows = await rows();
  out.audioNote = await text(app, "[data-menu-panel] .note");
  out.night = await text(app, "[data-menu-panel] .night");
  const patches = await calls("patch_session");
  const other = out.audioRows.findIndex((r) => !r.on);
  if (other >= 0) {
    await app.locator("[data-menu-panel] .opt").nth(other).click();
    await wait(800);
    out.audioPicked = { patched: (await calls("patch_session")) - patches, rows: (await rows()).map((r) => r.on) };
  }
  await step("Audio later", 1);
  await wait(200);
  out.delayOne = { value: await stepper(), sent: (await fake(app)).timing?.audioDelay ?? await app.evaluate(() => window.__fake.timing?.audioDelay) };
  await step("Audio later", 60);
  await wait(200);
  out.delayCapped = await stepper();
  await app.locator('[data-menu-panel] button[aria-label="Reset audio timing"]').click();
  await wait(200);
  out.delayReset = await stepper();
  await key("Escape");
  await wait(500);

  await shown(ctx);
  await button("Subtitles").click();
  await wait(500);
  out.subRows = await rows();
  await app.locator("[data-menu-panel] .opt").nth(1).click();
  await wait(800);
  out.subOn = { rows: (await rows()).map((r) => r.on), cue: await text(app, ".cue") };
  await step("Subtitles later", 1);
  out.syncOne = await stepper();
  await step("Subtitles later", 120);
  out.syncCapped = await stepper();
  await step("Subtitles earlier", 300);
  out.syncFloor = await stepper();
  await app.locator('[data-menu-panel] button[aria-label="Reset subtitles timing"]').click();
  await wait(200);
  await jump(ctx, 12);
  await app.locator(".style-head").click();
  await wait(300);
  const cue = () => app.evaluate(() => { const c = getComputedStyle(document.querySelector(".cue")); return { size: c.fontSize, color: c.color, background: c.backgroundColor }; });
  const seg = (label) => app.locator("[data-menu-panel] .seg-opt", { hasText: new RegExp(`^${label}$`) }).click();
  out.styleSummary = await text(app, ".style-box .summary");
  await seg("XL");
  await seg("Box");
  await seg("Yellow");
  await wait(300);
  out.styled = await cue();
  await shot("desk-player-menu-style");
  await seg("M");
  await seg("Shadow");
  await seg("White");
  await wait(200);
  out.unstyled = await cue();
  await app.locator("[data-menu-panel] .opt").nth(0).click();
  await wait(500);
  out.subOff = { rows: (await rows()).map((r) => r.on), cue: await app.locator(".cue").count() };
  await key("Escape");
  await wait(500);

  await shown(ctx);
  await button("Quality").click();
  await wait(500);
  out.qualityRows = await rows();
  out.qualityNote = await text(app, "[data-menu-panel] .note");
  await app.locator("[data-menu-panel] .opt", { hasText: "4 Mbit/s" }).click();
  await wait(800);
  out.qualityButton = await text(app, '.bottom button[aria-label="Quality"]');
  await key("Escape");
  await wait(500);
  await shown(ctx);
  await button("Speed").click();
  await wait(500);
  out.speedRows = (await rows()).map((r) => r.label);
  await app.locator("[data-menu-panel] .opt", { hasText: "1.5×" }).click();
  await wait(400);
  out.speedButton = await text(app, '.bottom button[aria-label="Speed"]');
  await key("Escape");
  await wait(500);

  await shown(ctx);
  await app.locator(".top .pill").click();
  await wait(700);
  out.stats = await app.evaluate(() => ({ title: document.querySelector(".sl-stats .head")?.textContent.trim(), rows: [...document.querySelectorAll(".sl-stats .stats-row")].map((r) => [...r.children].map((c) => c.textContent.trim())) }));
  await shot("desk-player-stats");
  await app.locator('.sl-stats button[aria-label="Close stats"]').click();
  await wait(500);
  out.statsClosed = await app.locator(".sl-stats").count();
  await key("i");
  await wait(600);
  out.statsKey = await app.locator(".sl-stats").count();
  await key("i");
  await wait(500);
  out.statsKeyOff = await app.locator(".sl-stats").count();
  out.pageErrors = ctx.log.filter((l) => l.startsWith("PAGEERR"));

  const ok =
    ["Subtitles", "Audio", "Quality", "Speed"].every((n) => out.opens[n]?.title === n && out.opens[n].right === 24 && out.opens[n].bottom === 100 && out.opens[n].width === 380) &&
    out.closedByButton === 0 &&
    out.replaced.count === 1 && out.replaced.title === "Audio" &&
    out.closedByPress === 0 &&
    out.closedByEscape.panels === 0 && out.closedByEscape.url.startsWith("/player") &&
    out.audioRows.length >= 1 && out.audioRows.filter((r) => r.on).length === 1 &&
    out.night?.includes("Night mode") && out.night.toLowerCase().includes("later") &&
    (other < 0 || (out.audioPicked.patched === 1 && out.audioPicked.rows[other])) &&
    out.delayOne.value === "+10 ms" && out.delayOne.sent === 10 &&
    out.delayCapped === "+500 ms" && out.delayReset === "0 ms" &&
    out.subRows[0].label === "Off" && out.subRows[0].on &&
    out.subOn.rows[1] && out.subOn.cue === "Hello there" &&
    out.syncOne === "+0.1 s" && out.syncCapped === "+10.0 s" && out.syncFloor === "−10.0 s" &&
    out.styled.size === "40px" && out.styled.background === "rgba(0, 0, 0, 0.72)" && out.styled.color === "rgb(253, 230, 138)" &&
    out.unstyled.size === "26px" && out.unstyled.color === "rgb(255, 255, 255)" &&
    out.subOff.rows[0] && out.subOff.cue === 0 &&
    out.qualityRows.map((r) => r.label).join() === "Auto,Original,20 Mbit/s,8 Mbit/s,4 Mbit/s,2 Mbit/s,1 Mbit/s" &&
    out.qualityButton === "4 Mbit/s" &&
    out.speedRows.join() === "0.5×,0.75×,Normal,1.25×,1.5×,2×" && out.speedButton === "1.5×" &&
    out.stats.title === "Playback stats" && ["Mode", "Player", "Video", "Audio", "Container", "Subtitles", "Bitrate", "Throughput", "Buffer", "Frames", "Speed", "Server"].every((l) => out.stats.rows.some((r) => r[0] === l)) &&
    !out.stats.rows.some((r) => r[0] === "Display") &&
    out.statsClosed === 0 && out.statsKey === 1 && out.statsKeyOff === 0 &&
    !out.pageErrors.length;
  if (!ok) throw new Error(JSON.stringify(out));
  return out;
};
