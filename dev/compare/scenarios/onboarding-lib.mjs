// Shared by the onboarding scenarios: the desktop app's welcome flow behind the Tauri shim (:1440), and the web
// approval page (:1430). A TV's pairing is started and approved through the mock, as the real devices and browsers do.
export const DESK = "http://localhost:1440";
export const MOCK = "http://127.0.0.1:8081";
const HOST = "streamline.home.arpa";

export const squash = (s) => s.replace(/\s+/g, " ").trim();
export const body = async (app, sel = ".page") => squash(await app.locator(sel).innerText());
export const dev = (path) => fetch(`${MOCK}/dev/${path}`, { method: "POST" });

export async function until(app, wait, test, what, tries = 60, step = 500) {
  for (let i = 0; i < tries; i++) {
    if (await test()) return;
    await wait(step);
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Opens the desktop app: with `server` saved it starts on the sign-in step, without it on the server step.
 * `fail` makes the browser round trip end with that error code. */
export async function openDesk(app, { server = HOST, fail = null } = {}) {
  await app.setViewportSize({ width: 1440, height: 900 });
  await app.addInitScript(
    (a) => {
      window.__signInFail = a.fail;
      window.__deviceInfo = { platform: "Linux · GNOME" };
      window.__auth = { paired: false, server: a.server, keystore: "Secret Service (GNOME Keyring)" };
    },
    { server: server ? `https://${server}` : null, fail },
  );
  await app.goto(`${DESK}/`);
}

export const waitSignIn = (app, wait) =>
  until(app, wait, () => app.getByRole("button", { name: "Continue with Streamline" }).count(), "the sign-in card");

/** Clicks the sign-in button and waits for the signed-in step. */
export async function signInOnScreen(app, wait) {
  await app.getByRole("button", { name: "Continue with Streamline" }).click();
  await until(app, wait, async () => (await body(app)).includes("You're signed in"), "the signed-in step");
}

export const WEB = "http://localhost:1430";
const API = "http://localhost:8098/extensions/player";

/** A device (a TV) asking for a code, as Streamline's pairing endpoints see it. */
export async function startDevice() {
  const res = await fetch(`${API}/auth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: "scenario-tv", name: "Living room TV", platform: "Android TV" }),
  });
  const r = await res.json();
  return { code: r.user_code, deviceCode: r.device_code };
}

/** What the device's poll gets now: an error code, or "api_key" once it was approved. */
export async function pollDevice(device) {
  const res = await fetch(`${API}/auth/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_code: device.deviceCode }),
  });
  const r = await res.json();
  return r.api_key ? "api_key" : r.error.code;
}

export const typeCode = (code) => code.replace("-", "").toLowerCase();
export const approvalBody = (app) => body(app, ".card");

/** The code as the page text reads it: one box per character. */
export const spaced = (code) => [...code].join(" ").replace("-", "–");
export const hideCode = (text, code) => text.replace(spaced(code), "CODE");
