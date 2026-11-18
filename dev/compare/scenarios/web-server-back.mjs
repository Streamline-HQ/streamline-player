// Server settings in the web player: the link above the title goes back to the viewer's own settings.
import { signInWithSso } from "./web-lib.mjs";

export const target = "web";

export default async ({ app, wait }) => {
  await app.setViewportSize({ width: 1440, height: 900 });
  await signInWithSso(app, wait, "/admin");
  await wait(1500);
  const back = app.locator("nav .back");
  const out = { shown: await back.count(), before: new URL(app.url()).pathname };
  await back.click({ timeout: 5000 }).catch((e) => (out.click = String(e.message).split("\n")[0]));
  await wait(1500);
  out.after = new URL(app.url()).pathname;
  if (out.after !== "/settings") throw new Error(JSON.stringify(out));
  return out;
};
