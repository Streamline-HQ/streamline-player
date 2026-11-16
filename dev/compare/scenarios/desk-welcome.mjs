// The desktop app's onboarding with no saved server: the address, the sign-in card and its browser round trip, the
// signed-in step and its three exits (the countdown, "Start watching", "Sign out"), and a sign-in that fails.
import { body, openDesk, signInOnScreen, squash, until, waitSignIn } from "./onboarding-lib.mjs";

export const target = "desktop";
export const mockArgs = [];

const path = (app) => app.evaluate(() => location.pathname);

export default async ({ app, shot, wait }) => {
  const out = {};
  await openDesk(app, { server: null });
  out.landed = await path(app);
  out.serverStep = await body(app);
  out.focused = await app.evaluate(() => document.activeElement?.tagName);
  out.prefix = await app.locator(".scheme").innerText();
  out.placeholder = await app.locator("input").getAttribute("placeholder");
  await shot("desk-welcome-server");
  await app.keyboard.press("Enter");
  out.empty = await app.locator(".help").innerText();
  await app.keyboard.type("not an address!");
  await app.keyboard.press("Enter");
  out.bad = await app.locator(".help").innerText();
  await shot("desk-welcome-error");
  await app.locator("input").fill("");
  await app.keyboard.type("127.0.0.1:8081");
  out.typed = await app.locator("input").inputValue();
  await app.keyboard.press("Enter");
  await wait(200);
  out.checking = squash(await app.locator("button[type=submit]").innerText());
  await until(app, wait, () => app.locator(".found").count(), "the found row", 30, 50);
  out.found = squash(await app.locator(".found").innerText());
  out.connected = squash(await app.locator("button[type=submit]").innerText());
  await shot("desk-welcome-found");
  await waitSignIn(app, wait);
  out.signInStep = await body(app);
  await shot("desk-welcome-signin");
  await app.getByRole("button", { name: "Continue with Streamline" }).click();
  await wait(300);
  out.busy = squash(await app.locator(".sso").innerText());
  out.opened = await app.evaluate(() => window.__opened);
  await shot("desk-welcome-browser");
  await until(app, wait, async () => (await body(app)).includes("You're signed in"), "the signed-in step");
  out.signedIn = await body(app);
  out.goLabel = /^\d s$/.test(await app.locator(".secs").innerText());
  await shot("desk-welcome-signed-in");
  await until(app, wait, async () => (await path(app)) === "/", "the countdown to end", 40);
  out.afterCountdown = await path(app);

  await openDesk(app);
  await waitSignIn(app, wait);
  out.savedServerStart = (await body(app)).includes("Continue with Streamline");
  await signInOnScreen(app, wait);
  await app.getByRole("button", { name: "Start watching" }).click();
  await wait(500);
  out.afterStartWatching = await path(app);

  await openDesk(app);
  await waitSignIn(app, wait);
  await signInOnScreen(app, wait);
  await app.getByRole("button", { name: "Sign out" }).click();
  await waitSignIn(app, wait);
  out.afterSignOut = squash(await app.locator(".toasts").innerText());

  await openDesk(app, { fail: "denied" });
  await waitSignIn(app, wait);
  await app.getByRole("button", { name: "Continue with Streamline" }).click();
  await until(app, wait, () => app.getByRole("alert").count(), "the error line");
  out.denied = (await app.getByRole("alert").innerText()).trim();
  await shot("desk-welcome-denied");
  await app.getByRole("button", { name: "Change" }).click();
  await wait(300);
  out.afterChange = (await body(app)).includes("Connect to your server");
  return out;
};
