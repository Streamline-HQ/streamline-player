// The mini player on the desktop. Expected: Picture in picture hands the running session to a card at the bottom right
// (24 px from each edge, 340 px wide, 16:9) and the picture rectangle follows its art area; one session throughout,
// position keeps rising; pause, play and the progress bar work; it stays across pages and is absent on the onboarding
// screens; "Back to full player" returns to the player on the same session with the full-window picture; Close and
// signing out stop the session; another title started from Detail replaces it.
import { fake, mockArgs, prepare, target, where } from "./player-lib.mjs";

export { mockArgs, target };

export default async (ctx) => {
  const { app, shot, wait } = ctx;
  await prepare(ctx);
  const out = {};
  const calls = (name) => app.evaluate((n) => window.__calls.filter((c) => c === n).length, name);
  const near = (a, b) => Math.abs(a - b) <= 1;
  const go = async (path) => {
    await app.evaluate((p) => {
      const a = document.createElement("a");
      a.href = p;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, path);
    await wait(1200);
  };
  const play = async (path, via) => {
    await app.goto(`http://localhost:1440${path}`);
    if (via) await go(via);
    else await app.getByRole("button", { name: /^Play/ }).first().click();
    for (let i = 0; i < 80 && !(await app.evaluate(() => window.__fake?.p.playing)); i++) await app.waitForTimeout(100);
    await app.evaluate(() => { window.__fakeTick = true; window.__fake.tickOn(); });
    await wait(1000);
  };
  const toMini = async () => {
    await app.mouse.move(600, 400);
    await app.mouse.move(640, 430);
    await wait(500);
    await app.locator('.bottom button[aria-label="Picture in picture"]').click();
    await app.waitForTimeout(700);
    await wait(500);
  };
  const mini = () => app.evaluate(() => {
    const el = document.querySelector(".mini");
    if (!el) return null;
    const art = document.querySelector(".mini .art").getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      right: window.innerWidth - r.right,
      bottom: window.innerHeight - r.bottom,
      width: r.width,
      ratio: art.width / art.height,
      title: el.querySelector(".title").innerText,
      buttons: [...el.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")),
      art: { x: art.x, y: art.y, width: art.width, height: art.height },
      bar: el.querySelector(".bar b").style.width,
    };
  });

  await play("/detail/series/1", "/player/series/1?ep=2");
  out.starts = await calls("start_session");
  const route = await where(app);
  out.player = route.startsWith("/player/series/1");
  await toMini();
  await shot("desk-mini-home");
  out.page = await where(app);
  out.mini = await mini();
  out.viewport = (await fake(app).then(() => app.evaluate(() => window.__fake.viewport)));
  out.viewportMatches = !!out.viewport && !out.viewport.full && near(out.viewport.x, out.mini.art.x) && near(out.viewport.y, out.mini.art.y) && near(out.viewport.width, out.mini.art.width) && near(out.viewport.height, out.mini.art.height);
  out.hole = await app.evaluate(() => {
    const p = document.getElementById("__fake-picture");
    const r = p?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  });

  await app.setViewportSize({ width: 1200, height: 800 });
  await wait(600);
  const resized = await mini();
  out.resized = await app.evaluate(() => window.__fake.viewport);
  out.resizedMatches = near(out.resized.x, resized.art.x) && near(out.resized.y, resized.art.y) && near(out.resized.width, resized.art.width);

  const before = (await fake(app)).pos;
  await wait(2500);
  const after = (await fake(app)).pos;
  out.rising = after > before + 1;
  out.sessions = await calls("start_session");

  await app.locator('.mini button[aria-label="Pause"]').click();
  await wait(400);
  out.paused = !(await fake(app)).playing;
  const pos = (await fake(app)).pos;
  const dur = await app.evaluate(() => window.__fake.p.dur);
  out.barPct = parseFloat((await mini()).bar);
  out.barMatches = Math.abs(out.barPct - (pos / dur) * 100) < 1.5;
  await app.locator('.mini button[aria-label="Play"]').click();
  await wait(400);
  out.resumed = (await fake(app)).playing;

  const kept = {};
  await app.getByRole("button", { name: "Movies", exact: true }).click();
  await wait(1200);
  kept.library = { url: await where(app), mini: !!(await mini()) };
  await app.getByRole("button", { name: "Shows", exact: true }).click();
  await wait(1200);
  kept.shows = { url: await where(app), mini: !!(await mini()) };
  await app.getByRole("button", { name: "Home", exact: true }).click();
  await wait(1200);
  kept.home = { url: await where(app), mini: !!(await mini()) };
  await app.keyboard.press("g");
  await app.keyboard.press(",");
  await wait(1200);
  kept.settings = { url: await where(app), mini: !!(await mini()) };
  await app.evaluate(() => { window.__auth = { paired: false }; });
  await go("/welcome");
  kept.welcome = { url: await where(app), mini: !!(await mini()) };
  await app.evaluate(() => { window.__auth = { paired: true }; });
  await go("/");
  kept.back = { url: await where(app), mini: !!(await mini()) };
  out.kept = kept;
  out.keptSession = (await calls("start_session")) === out.starts && (await calls("stop_session")) === 0;

  await app.locator('.mini button[aria-label="Back to full player"]').click();
  await wait(1500);
  out.expanded = {
    url: await where(app),
    mini: !!(await mini()),
    viewport: await app.evaluate(() => window.__fake.viewport),
    starts: await calls("start_session"),
    stops: await calls("stop_session"),
    playing: (await fake(app)).playing,
    controls: await app.locator(".bottom button").count(),
  };
  await shot("desk-mini-expanded");

  await toMini();
  await app.locator('.mini button[aria-label="Close picture in picture"]').click();
  await wait(1200);
  out.closed = { mini: !!(await mini()), stops: await calls("stop_session"), playing: (await fake(app)).playing, picture: await app.evaluate(() => !!document.getElementById("__fake-picture")) };

  await play("/detail/series/1", "/player/series/1?ep=2");
  await toMini();
  const startsBeforeReplace = await calls("start_session");
  const stopsBeforeReplace = await calls("stop_session");
  await go("/detail/movies/1");
  await app.getByRole("button", { name: /^Play/ }).first().click();
  for (let i = 0; i < 80 && (await calls("start_session")) === startsBeforeReplace; i++) await app.waitForTimeout(100);
  await wait(1500);
  out.replaced = {
    url: await where(app),
    mini: !!(await mini()),
    starts: (await calls("start_session")) - startsBeforeReplace,
    stops: (await calls("stop_session")) - stopsBeforeReplace,
  };

  await toMini();
  const stopsBeforeOut = await calls("stop_session");
  await app.locator('button[aria-label="Account menu"]').click();
  await wait(500);
  await app.getByRole("menuitem", { name: "Sign out" }).click();
  await wait(1500);
  out.signedOut = { url: await where(app), mini: !!(await mini()), stops: (await calls("stop_session")) - stopsBeforeOut, playing: (await fake(app)).playing };

  const ok =
    out.starts === 1 && out.player && out.page.startsWith("/detail/series/1") &&
    out.mini && near(out.mini.right, 24) && near(out.mini.bottom, 24) && near(out.mini.width, 340) && Math.abs(out.mini.ratio - 16 / 9) < 0.02 &&
    /^.+ · S\d+ E\d+$/.test(out.mini.title) &&
    ["Pause", "Back to full player", "Close picture in picture"].every((l) => out.mini.buttons.includes(l)) &&
    out.viewportMatches && out.hole && near(out.hole.x, out.mini.art.x) && near(out.hole.width, out.mini.art.width) &&
    out.resizedMatches && out.rising && out.sessions === 1 &&
    out.paused && out.barMatches && out.resumed &&
    Object.entries(kept).every(([name, k]) => (name === "welcome" ? !k.mini : k.mini)) && out.keptSession &&
    out.expanded.url.startsWith("/player/series/1") && !out.expanded.mini && out.expanded.viewport?.full === true &&
    out.expanded.starts === 1 && out.expanded.stops === 0 && out.expanded.playing && out.expanded.controls > 5 &&
    !out.closed.mini && out.closed.stops === 1 && !out.closed.playing && !out.closed.picture &&
    out.replaced.starts === 1 && out.replaced.stops === 1 && out.replaced.url.startsWith("/player/movies/1") && !out.replaced.mini &&
    !out.signedOut.mini && out.signedOut.stops === 1 && !out.signedOut.playing;
  if (!ok) throw new Error(JSON.stringify(out));
  return out;
};
