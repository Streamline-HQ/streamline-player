// Shared by the web scenarios that play real media through Shaka: the web build (:1430), the engine (:8097) behind the
// mock, and the page's own timers.
import { signInWithSso } from "./web-lib.mjs";

export const target = "web";
export const engine = true;
export const realClock = true;
// With two --clip flags the mock hands the first title h.mkv and the second long.mkv (40 s).
export const mockArgs = ["--clip", `${process.env.MEDIA_DIR ?? "/tmp/streamline-player"}/long.mkv`];
export const MOVIE = 2;

export const video = (app) =>
  app.evaluate(() => {
    const v = document.querySelector("video");
    if (!v) return null;
    const r = v.getBoundingClientRect();
    return {
      ready: v.readyState,
      at: v.currentTime,
      duration: v.duration,
      width: v.videoWidth,
      paused: v.paused,
      volume: v.volume,
      muted: v.muted,
      box: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      shown: getComputedStyle(v).display !== "none",
    };
  });

export async function until(app, what, test, seconds = 20) {
  for (let i = 0; i < seconds * 5; i++) {
    const v = await video(app);
    if (v && (await test(v))) return v;
    await app.waitForTimeout(200);
  }
  throw new Error(`${what}: not within ${seconds} s: ${JSON.stringify(await video(app))}`);
}

export async function playMovie({ app, wait }, id = MOVIE) {
  await signInWithSso(app, wait, `/detail/movies/${id}`);
  await app.getByRole("button", { name: /^Play/ }).first().click();
}

export const show = async (app) => {
  await app.mouse.move(700, 450);
  await app.mouse.move(730, 470);
  await app.waitForTimeout(500);
};

/** What the page sent to Streamline: the session bodies and answers, and every call by method and path. */
export function listen(app) {
  const seen = { sessions: [], answers: [], calls: [], auth: null };
  app.on("request", (r) => {
    seen.auth = r.headers().authorization ?? seen.auth;
    const url = new URL(r.url());
    seen.calls.push(`${r.method()} ${url.pathname}`);
    if (r.method() === "POST" && url.pathname.endsWith("/playback/sessions")) seen.sessions.push(r.postDataJSON());
  });
  app.on("response", async (r) => {
    const url = new URL(r.url());
    if (r.request().method() === "POST" && url.pathname.endsWith("/playback/sessions") && r.ok())
      seen.answers.push(await r.json().catch(() => null));
  });
  return seen;
}

export const started = (seen) => seen.calls.filter((c) => c.startsWith("POST ") && c.endsWith("/playback/sessions")).length;
export const stopped = (seen) => seen.calls.filter((c) => c.startsWith("DELETE ") && c.includes("/playback/sessions/")).length;
