// A read-only config locks the controls of its owner and hides the restart.
import { dev, expect, openServer, block, text } from "./server-lib.mjs";
import { targets } from "./browse-lib.mjs";

export const target = targets.desktop.target;
export const mockArgs = ["--demo-admin"];

export default async (ctx) => {
  const { app, shot, wait } = ctx;
  const side = targets.desktop;
  const writes = [];
  app.on("request", (r) => r.method() !== "GET" && r.url().includes("/extensions/player/admin/") && writes.push(`${r.method()} ${new URL(r.url()).pathname}`));
  const out = {};

  const locked = () =>
    app.locator(".server .std").evaluateAll((rows) =>
      rows.filter((r) => r.querySelector(".lock")).map((r) => [r.querySelector(".label").textContent.trim(), [...r.querySelectorAll("button, input")].every((c) => c.disabled)]),
    );
  const controls = () => app.locator('.server .std [role="switch"], .server .std input, .server .std fieldset').count();

  for (const mode of ["both", "engine", "streamline"]) {
    await dev(`admin/read-only/${mode}`);
    await openServer(ctx, side);
    await app.goto(`${side.url}/admin`);
    await wait(2500);
    expect(`${mode}: strip`, await text(app.locator(".server .strip .text")), "Read-only · managed from config");
    await app.locator(".server .strip button").click();
    await wait(300);
    expect(`${mode}: why`, await text(app.locator(".server .strip .why")), "This instance is configured externally and runs read-only. Editing controls are disabled.");
    out[mode] = await locked();
    await shot(`desk-server-readonly-${mode}`);
    const names = out[mode].map((r) => r[0]);
    expect(`${mode}: every locked control is disabled`, out[mode].every((r) => r[1]), true);
    const restartBlock = await block(app, "Restart").count();
    const restartNow = await app.getByRole("button", { name: "Restart now" }).count();
    if (mode === "both") {
      expect("both: all locked", names.length, await app.locator(".server .std").evaluateAll((rows) => rows.filter((r) => r.querySelector('[role="switch"], input, fieldset')).length));
      expect("both: no restart", [restartBlock, restartNow], [0, 0]);
    } else if (mode === "engine") {
      expect("engine: only the engine keys", names, ["Acceleration", "Device", "Conversions at once"]);
      expect("engine: restart stays", restartBlock, 1);
    } else {
      expect("streamline: the rest", names.includes("Acceleration") || names.includes("Conversions at once"), false);
      expect("streamline: restart stays", restartBlock, 1);
    }
    await app.locator('.server .std:has(.lock) [role="switch"], .server .std:has(.lock) input, .server .std:has(.lock) fieldset button').evaluateAll((els) => els.forEach((e) => e.click()));
    await app.keyboard.press("Tab");
    await app.reload();
    await wait(1500);
    expect(`${mode}: actions stay enabled`, [await app.getByRole("button", { name: "Scan all" }).isEnabled(), await app.locator(".stop").first().isEnabled()], [true, true]);
  }
  await dev("admin/read-only/off");
  expect("no PATCH", writes.filter((w) => w.startsWith("PATCH")), []);
  expect("no write at all", writes, []);
  return out;
};
