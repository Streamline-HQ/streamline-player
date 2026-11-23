// Continue watching on the desktop home. Expected: hovering a card shows the mark-watched and language buttons
// beside its play button, and marking an episode watched moves that series on to its next episode (or drops a movie).
export const target = "desktop";

export default async ({ app, shot, wait }) => {
  await app.setViewportSize({ width: 1440, height: 900 });
  await app.goto("http://localhost:1440/");
  await wait(1000);
  const cards = () => app.locator(".beside-box");
  const out = { before: await app.locator(".beside-box .title").allTextContents() };
  await cards().first().hover();
  await wait(400);
  await shot("desk-resume-hover");
  out.buttons = await cards().first().locator(".beside button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
  await cards().first().locator(".beside button").first().click();
  await wait(800);
  await shot("desk-resume-marked");
  out.after = await app.locator(".beside-box .title").allTextContents();
  return out;
};
