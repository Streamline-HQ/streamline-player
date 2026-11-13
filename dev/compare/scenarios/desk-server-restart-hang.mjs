// A restart that never comes back: with nobody watching the dialog has no message field, and after 60 s the screen says so and keeps asking.
import { confirmRestart, dialog, dotIsWarning, expect, norm, restartButton, start, targets, toast } from "./server-restart-lib.mjs";
import { dev, text } from "./server-lib.mjs";

export const target = targets.desktop.target;
export const realClock = true;
export const mockArgs = ["--demo-admin"];

export default async (ctx) => {
  const { app, shot, wait } = ctx;
  const rec = await start(ctx);
  await dev("admin/streams/clear");
  await dev("admin/restart-hangs/on");
  await app.reload();
  await wait(3000);

  await restartButton(app).click();
  await wait(700);
  expect("empty dialog", [norm(await dialog(app).locator("p").first().textContent()), await dialog(app).locator("textarea").count()], ["Nobody is watching. The engine is back in about 10 seconds. You can still abort for 10 seconds after this.", 0]);
  await dialog(app).getByRole("button", { name: "Restart", exact: true }).click();
  await wait(800);
  expect("quiet countdown", /^in (10|9) s · nobody is watching$/.test(await text(app.locator(".sl-cdtoast .sl-cdtoast__sub"))), true);
  await app.locator(".sl-cdtoast").getByRole("button", { name: "Now" }).click();
  await wait(600);
  expect("sent", [rec.writes().filter((c) => c.path === "/admin/restart").map((c) => c.body), await toast(app)], [["{}"], "Restarting…"]);
  await wait(62000);
  expect("late", [await text(app.locator(".server .strip.late")), await restartButton(app).textContent().then((t) => t.trim()), await dotIsWarning(app)], ["The engine hasn’t come back yet.", "Restarting…", true]);
  const polled = rec.all.length;
  await wait(5000);
  expect("still asking", rec.since(polled).some((c) => c.path === "/admin/overview"), true);
  await shot("desk-server-restart-late");
  return {};
};
