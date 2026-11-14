// A member never reaches the admin screen: no entry points, no admin request, and a role lost while it is open sends them away.
import { dev, expect, text } from "./server-lib.mjs";
import { targets } from "./browse-lib.mjs";

export const target = targets.web.target;
export const mockArgs = ["--role", "member", "--demo-admin"];

const MOCK = "http://127.0.0.1:8081";
const pathOf = (app) => app.evaluate(() => location.pathname);

export default async (ctx) => {
  const { app, shot, wait } = ctx;
  const side = targets.web;
  const calls = [];
  app.on("response", (r) => r.url().includes("/api/v1/admin/") && calls.push(r.status()));
  await app.setViewportSize({ width: 1440, height: 900 });
  await side.open(ctx);
  await wait(1500);
  const out = {};

  await app.goto(`${side.url}/settings`);
  await wait(1500);
  expect("member settings header", [await app.locator('.settings button.server').count(), await app.locator(".settings .ping").count()], [0, 1]);
  await shot("web-server-member-settings");
  await app.locator("button.account").click();
  await wait(600);
  expect("member menu", await app.locator('[role="menuitem"]').filter({ hasText: "Server settings" }).count(), 0);
  await app.keyboard.press("Escape");
  await wait(500);
  await app.goto(`${side.url}/`);
  await wait(1500);
  await app.keyboard.press("g");
  await app.keyboard.press("a");
  await wait(1200);
  expect("G A does nothing", await pathOf(app), "/");
  await app.keyboard.press("?");
  await wait(700);
  expect("member shortcuts", await app.locator('[role="dialog"]').getByText("Server settings").count(), 0);
  await app.keyboard.press("Escape");
  await wait(500);
  await app.goto(`${side.url}/admin`);
  await wait(2500);
  expect("url leaves", await pathOf(app), "/settings");
  expect("no admin text", await app.locator(".server").count(), 0);
  const direct = await fetch(`${MOCK}/api/v1/admin/overview`);
  expect("mock says 403", [direct.status, calls], [403, []]);

  await dev("role/admin");
  await app.goto(`${side.url}/admin`);
  await wait(2500);
  expect("admin gets in", await pathOf(app), "/admin");
  await dev("role/member");
  await wait(11000);
  expect("demoted leaves", await pathOf(app), "/settings");
  expect("button gone", await app.locator('.settings button.server').count(), 0);
  expect("403 seen", calls.includes(403), true);
  await app.goto(`${side.url}/admin`);
  await wait(2500);
  expect("url leaves again", await pathOf(app), "/settings");
  return out;
};
