// Shared by the trickplay scenarios: hover the scrubber and compare the preview with what tileAt says for that time.
import { parseTrickplay, tileAt } from "../../../src/lib/core/trickplay.ts";

export async function hoverAt(app, ratio) {
  const box = await app.locator(".scrub").boundingBox();
  await app.mouse.move(box.x + box.width * ratio - 5, box.y + box.height / 2);
  await app.mouse.move(box.x + box.width * ratio, box.y + box.height / 2);
  await app.waitForTimeout(400);
  const duration = Number(await app.locator(".scrub").getAttribute("aria-valuemax"));
  const peek = await app.evaluate(() => {
    const frame = document.querySelector(".peek .frame");
    if (!frame) return null;
    const tile = frame.querySelector(".tile");
    const img = frame.querySelector("img");
    const style = tile && getComputedStyle(tile);
    return {
      frame: frame.clientWidth,
      frameHeight: frame.clientHeight,
      radius: getComputedStyle(frame).borderRadius,
      image: style?.backgroundImage ?? null,
      position: style?.backgroundPosition ?? null,
      still: !!img && img.getAttribute("src"),
      when: document.querySelector(".peek .when")?.textContent ?? null,
    };
  });
  return { duration, peek };
}

/** The tile the index names for the second the hover label shows, as a CSS background position in the frame's pixels (the tile covers the 16:9 frame, centred, as the still does). */
export async function expected(sheetUrl, seconds, frame, frameHeight) {
  const index = new URL(sheetUrl);
  index.pathname = index.pathname.replace(/[^/]+$/, "trickplay.json");
  const tp = parseTrickplay(index.href, await (await fetch(index)).text());
  const t = tileAt(tp, seconds);
  const scale = Math.max(frame / tp.tileWidth, frameHeight / tp.tileHeight);
  const ox = (frame - tp.tileWidth * scale) / 2;
  const oy = (frameHeight - tp.tileHeight * scale) / 2;
  return { sheet: t.sheet, x: ox - t.x * scale, y: oy - t.y * scale };
}

export const sheetOf = (image) => /url\("?([^")]+)"?\)/.exec(image ?? "")?.[1] ?? null;
export const secondsOf = (when) => {
  const m = /^(?:(\d+):)?(\d+):(\d+)/.exec(when ?? "");
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};

/** True when the preview shows the tile the index gives for the hover time (the label rounds down, so a second later is allowed). */
export async function showsTile(peek) {
  const sheet = sheetOf(peek.image);
  if (!sheet || !peek.position) return false;
  const [px, py] = peek.position.split(" ").map(parseFloat);
  const seconds = secondsOf(peek.when);
  for (const at of [seconds, seconds + 0.9]) {
    const want = await expected(sheet, at, peek.frame, peek.frameHeight);
    if (want.sheet === sheet && Math.abs(want.x - px) <= 1 && Math.abs(want.y - py) <= 1) return true;
  }
  return false;
}
