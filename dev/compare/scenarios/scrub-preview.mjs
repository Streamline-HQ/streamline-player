// The TV scrubber's trickplay preview. Expected: with the scrubber focused after one Right press, a frame sits above
// the knob inside the bar's ends, shows a sheet tile under /media/, and focus stays on the scrubber; with the
// tracks' trickplay forced to null the same walk shows no frame.
export default async ({ app, shot, wait, key, focused }) => {
  const out = {};
  const walk = async () => {
    await app.goto("http://localhost:1420/player/movies/1002");
    await wait(3500);
    await app.addStyleTag({ content: "html,body{background:#000 url(http://127.0.0.1:8099/artwork/movies/1/backdrop.jpg) center/cover no-repeat !important}" });
    for (let i = 0; i < 3 && !(await app.evaluate(() => document.activeElement?.hasAttribute("data-scrub"))); i++) await key("ArrowUp");
    await key("ArrowRight");
    await wait(500);
  };
  const read = () => app.evaluate(() => {
    const box = (el) => { const r = el?.getBoundingClientRect(); return r ? [r.x, r.y, r.width, r.height].map(Math.round) : null; };
    const frame = document.querySelector(".scrub-peek .scrub-frame");
    const tile = frame?.querySelector(".scrub-tile");
    const style = tile && getComputedStyle(tile);
    return {
      scrub: box(document.querySelector(".scrub")),
      thumb: box(document.querySelector(".scrub .thumb")),
      peek: box(document.querySelector(".scrub-peek")),
      frame: box(frame),
      sheet: /url\("?([^")]+)"?\)/.exec(style?.backgroundImage ?? "")?.[1]?.replace(/exp=\d+&sig=\w+/, "exp=N&sig=S") ?? null,
      position: style?.backgroundPosition ?? null,
      when: document.querySelector(".scrub-peek .scrub-when")?.textContent ?? null,
      times: box(document.querySelector(".times")),
      play: box(document.querySelector(".play")),
    };
  });
  await walk();
  out.focus = await focused();
  out.shown = await read();
  await shot("scrub-preview");
  await key("ArrowDown");
  out.afterDown = await focused();
  await app.evaluate(() => localStorage.setItem("__noTrickplay", "1"));
  await walk();
  out.focusNull = await focused();
  out.none = await read();
  await app.evaluate(() => localStorage.removeItem("__noTrickplay"));
  const { shown, none } = out;
  const inside = shown.frame && shown.peek[0] >= shown.scrub[0] && shown.peek[0] + shown.peek[2] <= shown.scrub[0] + shown.scrub[2];
  const same = ["scrub", "thumb", "times", "play"].every((k) => shown[k].join() === none[k].join());
  if (!inside || none.frame || !/\/media\/[^/]+\/sheet_\d+\.jpg/.test(shown.sheet ?? "") || out.focus !== out.focusNull || !same)
    throw new Error(JSON.stringify(out));
  return out;
};
