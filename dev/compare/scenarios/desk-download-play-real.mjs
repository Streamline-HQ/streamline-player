// A download plays from its own file with the server's playback API untouched. The file is a real one: the engine's
// download job for the mock's clip, served from /dl. Expected: Play on the card loads that URL and no session is
// started, the position runs on the page's own timers, and the engine serves the file to a Range request.
import { expect, pathOf, sample, seed } from "./downloads-lib.mjs";
import { mockArgs, prepare, target } from "./player-lib.mjs";

export { mockArgs, target };
export const engine = true;
export const realClock = true;

const MOCK = "http://127.0.0.1:8081/extensions/player";
const get = (path) => fetch(`${MOCK}${path}`).then((r) => r.json());
const CAPS = {
  video: [{ codec: "h264", profiles: ["high", "main"], max_level: 52, max_width: 3840, max_height: 2160, max_fps: 60 }],
  hdr: { formats: [], dv_profiles: [] },
  audio: { codecs: ["aac", "ac3", "eac3"], max_channels: 6, passthrough: [] },
  containers: ["mkv", "mp4"],
  subtitles: ["srt"],
  hls_keyframe_exact: false,
};

async function preparedFile() {
  // The first title plays a clip with no sound; the one with several audio tracks is the one a download can pick from.
  const { items } = await get("/movies");
  let mediaId;
  let tracks;
  for (const m of items) {
    const id = (await get(`/movies/${m.id}`)).media_files[0].id;
    for (let i = 0; i < 20; i++) {
      tracks = await get(`/playback/media/${id}/tracks`);
      if (!tracks.preparing) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (tracks.audio?.length) {
      mediaId = id;
      break;
    }
  }
  if (!mediaId) throw new Error("no title with audio");
  const posted = await fetch(`${MOCK}/downloads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: mediaId, quality: "original", audio_indexes: tracks.audio.map((a) => a.index), capabilities: CAPS }),
  });
  if (posted.status !== 201) throw new Error(`download job: ${posted.status}`);
  const job = await posted.json();
  for (let i = 0; i < 120; i++) {
    const now = await get(`/downloads/${job.id}`);
    if (now.state === "ready") return { mediaId, url: now.url, tracks };
    if (now.state === "failed") throw new Error("the download job failed");
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("the download job never finished");
}

export default async (ctx) => {
  const { app, shot, wait } = ctx;
  const out = {};
  await prepare(ctx);
  const file = await preparedFile();
  await app.addInitScript((url) => { window.__localUrl = url; }, file.url);
  await app.goto("http://localhost:1440/downloads");
  await wait(1500);
  const entries = sample().map((e) => (e.key === "movies:3" ? { ...e, media_id: file.mediaId } : e));
  await seed(app, entries);
  await wait(800);
  const calls = () => app.evaluate(() => [...window.__calls]);
  const before = await calls();
  await app.locator('.page .card[data-key="movies:3"] .still').click();
  for (let i = 0; i < 100 && !(await app.evaluate(() => window.__fake?.p.playing)); i++) await wait(100);
  await app.evaluate(() => { window.__fakeTick = true; window.__fake.tickOn(); });
  await wait(1200);
  const first = await app.evaluate(() => window.__fake.p.pos);
  await wait(3000);
  const second = await app.evaluate(() => window.__fake.p.pos);
  out.play = {
    path: await pathOf(app),
    loaded: await app.evaluate(() => window.__fake.loads.map((l) => l.url)),
    advanced: second - first >= 2,
    sessions: (await calls()).slice(before.length).filter((c) => ["start_session", "decisions", "media_tracks"].includes(c)),
  };
  expect("plays the file", out.play, { path: "/player/movies/3?local=1", loaded: [file.url], advanced: true, sessions: [] });
  const served = await fetch(file.url, { headers: { Range: "bytes=0-99" } });
  out.served = { status: served.status, bytes: (await served.arrayBuffer()).byteLength };
  expect("the engine serves the file", [out.served.status, out.served.bytes], [206, 100]);
  await shot("desk-download-play-real");
  out.pageErrors = ctx.log.filter((l) => l.startsWith("PAGEERR"));
  expect("no page errors", out.pageErrors, []);
  return out;
};
