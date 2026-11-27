// The Magic Remote pointer on the TV layout. Expected: pointing at a card focuses it without scrolling its row;
// the D-pad then moves on from there even with the pointer resting on the screen; the wheel steps Home's rows and
// scrolls the library; a click opens the card; in the player a move brings the controls back, pointing at the bar
// focuses it and a click there seeks to that point (about half of 5400 s).
export default async ({ app, wait, key, focused }) => {
  const out = {};
  await app.goto("http://localhost:1420/");
  await wait(3500);
  const rows = () => app.evaluate(() => [...document.querySelectorAll("[data-tv-row]")].map((r) => Math.round(r.scrollLeft)));
  const centre = (sel, i = 0) => app.evaluate(([s, n]) => {
    const r = document.querySelectorAll(s)[n].getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, [sel, i]);

  const [x, y] = await centre(".row [data-tv]", 3);
  const before = await rows();
  await app.mouse.move(x - 20, y, { steps: 1 });
  await app.mouse.move(x, y, { steps: 4 });
  await wait(300);
  out.pointed = await focused();
  out.pointedRowsKept = JSON.stringify(await rows()) === JSON.stringify(before);

  await app.evaluate(() => {
    window.__seen = { move: 0, over: 0 };
    addEventListener("pointermove", () => window.__seen.move++);
    addEventListener("pointerover", () => window.__seen.over++);
  });
  await key("ArrowRight", 6);
  out.afterDpad = await focused();
  out.dpadKept = out.afterDpad !== out.pointed;
  out.eventsDuringDpad = await app.evaluate(() => window.__seen);

  const wheelFrom = await rows();
  await app.mouse.wheel(0, 600);
  await wait(600);
  out.wheelDown = { focus: await focused(), rows: await rows(), from: wheelFrom };
  await app.mouse.wheel(600, 0);
  await wait(600);
  out.wheelRight = { focus: await focused(), rows: await rows() };

  await app.goto("http://localhost:1420/library/movies");
  await wait(3500);
  const tops = () => app.evaluate(() => [...document.querySelectorAll("*")].filter((e) => e.scrollTop > 0).map((e) => `${e.className}:${Math.round(e.scrollTop)}`));
  await app.mouse.move(900, 600, { steps: 4 });
  await app.mouse.wheel(0, 600);
  await wait(600);
  out.libraryWheel = { focus: await focused(), scrolled: await tops() };

  await app.goto("http://localhost:1420/");
  await wait(3500);
  const [cx, cy] = await centre(".row [data-tv]", 0);
  await app.mouse.move(cx, cy, { steps: 4 });
  await app.mouse.click(cx, cy);
  await wait(2500);
  out.clicked = new URL(app.url()).pathname;

  await app.goto("http://localhost:1420/player/movies/1");
  await wait(4000);
  await app.evaluate(() => { window.__fakeTick = true; window.__fake.tickOn(); });
  await wait(4500);
  const chrome = () => app.evaluate(() => document.querySelector(".chrome") && getComputedStyle(document.querySelector(".chrome")).opacity);
  out.idleChrome = await chrome();
  await app.mouse.move(900, 500, { steps: 4 });
  await wait(300);
  out.movedChrome = await chrome();
  const bar = await centre(".scrub");
  await app.mouse.move(bar[0], bar[1], { steps: 4 });
  out.barFocused = await app.evaluate(() => document.activeElement?.hasAttribute("data-scrub"));
  await app.mouse.click(bar[0], bar[1]);
  await wait(300);
  out.afterClick = await app.evaluate(() => ({ pos: Math.round(window.__fake.p.pos), dur: window.__fake.p.dur }));
  return out;
};
