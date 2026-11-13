import { recorder } from "./server-actions-lib.mjs";
import { block, expect, openServer, targets, text } from "./server-lib.mjs";

export { targets };
export const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
export const dialog = (app) => app.locator('[role="dialog"]');
export const toast = (app) => text(app.locator(".sl-toast").first());
export const restartButton = (app) => block(app, "Restart").locator("button");
export const dotIsWarning = (app) =>
  app.evaluate(() => {
    const dot = document.querySelector("nav .host .dot");
    const probe = document.createElement("i");
    probe.style.background = "var(--status-warning)";
    document.body.append(probe);
    const same = getComputedStyle(probe).backgroundColor === getComputedStyle(dot).backgroundColor;
    probe.remove();
    return same;
  });

export async function start(ctx) {
  const { app, wait } = ctx;
  const rec = recorder(app);
  await openServer(ctx, targets.desktop);
  await app.goto(`${targets.desktop.url}/admin`);
  await wait(2500);
  return rec;
}

/** Opens the restart dialog, picks a preset when the message field is there, and confirms. */
export async function confirmRestart(ctx, preset) {
  const { app, wait } = ctx;
  await restartButton(app).click();
  await wait(700);
  if (preset) await dialog(app).getByRole("button", { name: preset }).click();
  await dialog(app).getByRole("button", { name: "Restart", exact: true }).click();
  await wait(800);
}
export { block, expect };
