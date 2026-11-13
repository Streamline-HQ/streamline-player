// The restart on the page's own timers: dialog, countdown, abort, "Now", the wait and the way back.
import { block, confirmRestart, dialog, dotIsWarning, expect, norm, restartButton, start, targets, toast } from "./server-restart-lib.mjs";
import { text } from "./server-lib.mjs";

export const target = targets.desktop.target;
export const realClock = true;
export const mockArgs = ["--demo-admin"];

export default async (ctx) => {
  const { app, shot, wait } = ctx;
  const rec = await start(ctx);
  const out = {};

  await restartButton(app).click();
  await wait(700);
  expect("restart dialog", [norm(await dialog(app).locator(".sl-dialog__title").textContent()), norm(await dialog(app).locator("p").first().textContent())], ["Restart the engine?", "3 streams in progress stop for about 10 seconds, then players reconnect on their own. You can still abort for 10 seconds after this."]);
  expect("message field", norm(await dialog(app).locator(".head").textContent()), "Message to everyone watching Optional");
  expect("restart presets", await dialog(app).locator("button[aria-pressed]").allTextContents().then((a) => a.map(norm)), ["Installing an update", "Back in a minute"]);
  await dialog(app).getByRole("button", { name: "Back in a minute" }).click();
  await shot("desk-server-restart-dialog");
  await dialog(app).getByRole("button", { name: "Restart", exact: true }).click();
  await wait(800);
  const cd = app.locator(".sl-cdtoast");
  expect("countdown title", await text(cd.locator(".sl-cdtoast__title")), "Restarting the engine");
  const line = await text(cd.locator(".sl-cdtoast__sub"));
  expect("countdown line", /^in (10|9) s · 3 streams will pause$/.test(line), true);
  await shot("desk-server-restart-countdown");
  await wait(2200);
  await cd.getByRole("button", { name: "Abort" }).click();
  await wait(400);
  expect("aborted", [await toast(app), rec.writes().filter((c) => c.path === "/admin/restart").length], ["Restart aborted", 0]);

  await block(app, "Application log").locator("fieldset button", { hasText: "Debug" }).click();
  await wait(700);
  expect("a key waits", (await text(app.locator(".server .note").first())).startsWith("1 change only applies after a restart"), true);
  await confirmRestart(ctx, "Back in a minute");
  await app.locator(".sl-cdtoast").getByRole("button", { name: "Now" }).click();
  await wait(600);
  expect("one restart request", rec.writes().filter((c) => c.path === "/admin/restart").map((c) => c.body), ['{"message":"Back in a minute"}']);
  expect("restarting toast", await toast(app), "Restarting…");
  expect("status warns", await dotIsWarning(app), true);
  expect("restart controls", [await restartButton(app).textContent().then((t) => t.trim()), await restartButton(app).isDisabled(), await app.locator(".server .note button").evaluateAll((b) => b.map((x) => [x.textContent.trim(), x.disabled]))], ["Restarting…", true, [["Restarting…", true]]]);
  await shot("desk-server-restarting");

  let back = "";
  for (let i = 0; i < 40 && !back.startsWith("Engine back online"); i++) {
    await wait(500);
    back = await toast(app).catch(() => "");
  }
  expect("back online toast", back, "Engine back online · players reconnected");
  expect("status clear", [await dotIsWarning(app), await text(app.locator(".tile", { hasText: "Health" }).first().locator(".value")), await restartButton(app).textContent().then((t) => t.trim())], [false, "All good", "Restart"]);
  expect("chip and note gone", [await app.locator(".server .std", { hasText: "After restart" }).count(), await app.locator(".server .note").count()], [0, 0]);
  return out;
};
