// An admin stops a real stream: the engine plays it, Streamline lists it for the admin, the stop reaches the player on a heartbeat.
import { engine, listen, mockArgs, playMovie, realClock, target, until } from "./web-play-lib.mjs";

export { engine, mockArgs, realClock, target };

const API = "http://localhost:8098/extensions/player";
const MESSAGE = "Need the bandwidth";

export default async (ctx) => {
  const { app, shot } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  const seen = listen(app);
  await playMovie(ctx);
  await until(app, "ready", (v) => v.ready >= 3 && !v.paused);
  const head = { Authorization: seen.auth, "Content-Type": "application/json" };

  let listed = [];
  for (let i = 0; i < 70 && listed.length !== 1; i++) {
    await app.waitForTimeout(500);
    const res = await fetch(`${API}/admin/streams`, { headers: head });
    listed = res.ok ? (await res.json()).items : [];
  }
  if (listed.length !== 1 || listed[0].user?.you !== true) throw new Error(`streams: ${JSON.stringify(listed)}`);
  const stopped = await fetch(`${API}/admin/streams/${listed[0].id}/stop`, { method: "POST", headers: head, body: JSON.stringify({ message: MESSAGE }) });
  if (stopped.status !== 204) throw new Error(`stop answered ${stopped.status}`);

  let halt = null;
  for (let i = 0; i < 60 && !halt; i++) {
    await app.waitForTimeout(500);
    halt = await app.evaluate(() => {
      const h = document.querySelector(".halt");
      return h ? { title: h.querySelector(".title")?.innerText.trim(), message: h.querySelector(".msg-text")?.innerText.trim() } : null;
    });
  }
  await shot("web-server-stop-real");
  if (!halt || halt.title !== "An admin stopped this stream" || !halt.message?.includes(MESSAGE)) throw new Error(`halt: ${JSON.stringify(halt)}`);
  return { stream: { mode: listed[0].mode, you: listed[0].user.you }, halt };
};
