// A save or an action the server refuses or never answers puts everything back and says so; a lock that appears while the screen is open shows up.
import { recorder } from "./server-actions-lib.mjs";
import { block, dev, expect, openServer, targets, text } from "./server-lib.mjs";

export const target = targets.desktop.target;
export const mockArgs = ["--demo-admin"];

const FAILED = "That didn’t save. Try again.";
const toast = (app) => text(app.locator(".sl-toast").first());
const row = (app, label) => app.locator(".server .std").filter({ has: app.locator(".label", { hasText: new RegExp(`^${label}$`) }) });

export default async (ctx) => {
  const { app, shot, wait } = ctx;
  const side = targets.desktop;
  const rec = recorder(app);
  await openServer(ctx, side);
  await app.goto(`${side.url}/admin`);
  await wait(2500);
  const out = {};

  const watch = row(app, "Watch folders for changes").locator('[role="switch"]');
  await dev("admin/fail/save");
  await watch.click();
  await wait(700);
  expect("toggle flips back", await watch.getAttribute("aria-checked"), "true");
  expect("no chip left", await app.locator(".server .std", { hasText: "After restart" }).count(), 0);
  expect("save failed toast", await toast(app), FAILED);
  await shot("desk-server-save-failed");
  await dev("admin/fail/off");
  await watch.click();
  await wait(700);
  expect("the same switch saves", [await watch.getAttribute("aria-checked"), await toast(app)], ["false", "Saved"]);

  await dev("admin/fail/action");
  const dialog = app.locator('[role="dialog"]');
  await app.locator('.server .stream .stop[aria-label="Stop Camille’s stream"]').click();
  await wait(700);
  await dialog.getByRole("button", { name: "Stop stream" }).click();
  await wait(700);
  expect("stop restored", [await app.locator(".server .stream").count(), await toast(app)], [3, FAILED]);
  const pixel = block(app, "Paired apps").locator(".item", { hasText: "Pixel 9" });
  await pixel.getByRole("button", { name: "Revoke" }).click();
  await wait(700);
  expect("revoke restored", [await pixel.count(), await toast(app)], [1, FAILED]);
  const movies = block(app, "Folders").locator(".item", { hasText: "Movies" });
  await movies.getByRole("button", { name: "Scan" }).click();
  await wait(700);
  expect("scan restored", [await movies.locator("button").textContent().then((t) => t.trim()), await toast(app)], ["Scan", FAILED]);
  const cache = block(app, "Cache");
  await cache.getByRole("button", { name: "Clear" }).click();
  await wait(700);
  expect("clear restored", [await cache.getByRole("button", { name: "Clear" }).count(), await cache.locator(".note").count(), await toast(app)], [1, 0, FAILED]);
  await dev("admin/fail/off");

  const keep = block(app, "Telemetry & retention").locator("input").nth(1);
  await keep.fill("soon");
  await keep.press("Enter");
  await wait(700);
  expect("refused value", [await keep.inputValue(), await toast(app)], ["2160h", "That value isn’t allowed."]);

  await dev("admin/read-only/streamline");
  await watch.click();
  await wait(700);
  expect("lock found", [await watch.getAttribute("aria-checked"), await text(app.locator(".server .strip .text")), await watch.isDisabled()], ["false", "Read-only · managed from config", true]);
  await shot("desk-server-locked-late");
  await dev("admin/read-only/off");

  const writes = rec.writes().filter((c) => c.path.startsWith("/admin/settings"));
  out.patches = writes.length;

  await app.route("**/api/v1/admin/overview", (r) => r.abort());
  await app.goto(`${side.url}/admin`);
  await wait(2500);
  expect("load failed", [await text(app.locator(".server")).then((t) => t.includes("Couldn’t load server settings")), await app.getByRole("button", { name: "Try again" }).count()], [true, 1]);
  await shot("desk-server-load-failed");
  await app.unroute("**/api/v1/admin/overview");
  await app.getByRole("button", { name: "Try again" }).click();
  await wait(2000);
  expect("loads once requests pass", [await app.locator("nav .item").count(), await app.getByRole("button", { name: "Try again" }).count()], [6, 0]);
  return out;
};
