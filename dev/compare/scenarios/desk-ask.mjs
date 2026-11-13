// The Shell's confirm dialog and countdown toast, opened through the dev-only window.__slp hook (the Server screen comes later).
import { targets } from "./browse-lib.mjs";

export const target = targets.desktop.target;
export const mockArgs = [];

const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
function expect(what, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}

export default async (ctx) => {
  const { app, shot, wait } = ctx;
  await app.setViewportSize({ width: 1440, height: 900 });
  await targets.desktop.open(ctx);
  await wait(1500);
  const out = {};
  const dialog = app.locator('[role="dialog"]');
  const message = dialog.locator("textarea");
  const chips = dialog.locator("button[aria-pressed]");
  const openAsk = () =>
    app.evaluate(() => {
      window.__got = [];
      window.__slp.ask({
        title: "Stop this stream?",
        body: "Camille will see a message instead of the picture.",
        input: { label: "Message to the viewer", placeholder: "Say why", presets: ["Maintenance", "Server restarting", "Please try later"] },
        confirm: "Stop stream",
        onconfirm: (m) => window.__got.push(m),
      });
    });

  await openAsk();
  await wait(600);
  out.title = norm(await dialog.locator(".sl-dialog__title").textContent());
  out.body = norm(await dialog.locator("p").first().textContent());
  out.label = norm(await dialog.locator(".head").textContent());
  out.presets = await chips.allTextContents().then((a) => a.map(norm));
  expect("title", out.title, "Stop this stream?");
  expect("body", out.body, "Camille will see a message instead of the picture.");
  expect("label", out.label, "Message to the viewer Optional");
  expect("presets", out.presets, ["Maintenance", "Server restarting", "Please try later"]);
  expect("buttons", await dialog.locator(".sl-dialog__foot button").allTextContents().then((a) => a.map(norm)), ["Cancel", "Stop stream"]);
  expect("footer buttons are 40px", await dialog.locator(".sl-dialog__foot button").evaluateAll((b) => b.map((x) => Math.round(x.getBoundingClientRect().height))), [40, 40]);
  await shot("desk-ask-dialog");

  await chips.nth(1).click();
  expect("chip fills", await message.inputValue(), "Server restarting");
  expect("chip pressed", await chips.nth(1).getAttribute("aria-pressed"), "true");
  await chips.nth(1).click();
  expect("chip clears", await message.inputValue(), "");

  await app.keyboard.press("Escape");
  await wait(500);
  expect("escape closes", await dialog.count(), 0);
  expect("escape confirms nothing", await app.evaluate(() => window.__got), []);

  await openAsk();
  await wait(600);
  await app.mouse.click(20, 450);
  await wait(500);
  expect("backdrop closes", await dialog.count(), 0);
  expect("backdrop confirms nothing", await app.evaluate(() => window.__got), []);

  await openAsk();
  await wait(600);
  await message.fill("  Back soon  ");
  await dialog.getByRole("button", { name: "Stop stream" }).click();
  await wait(500);
  expect("confirm passes the message", await app.evaluate(() => window.__got), ["Back soon"]);
  expect("confirm closes", await dialog.count(), 0);

  await app.evaluate(() => {
    window.__ended = [];
    window.__slp.countdown({
      title: "Restarting the server",
      seconds: 10,
      note: "3 streams will pause",
      ondone: () => window.__ended.push("done"),
      onabort: () => window.__ended.push("abort"),
    });
  });
  await wait(600);
  const cd = app.locator(".sl-cdtoast");
  out.countdown = norm(await cd.locator(".sl-cdtoast__sub").textContent());
  // The fake clock runs on beside real time, so the first reading may already be a second in.
  const left = (line) => Number(/^in (\d+) s/.exec(line)?.[1]);
  expect("countdown line", out.countdown.replace(/^in \d+ s/, "in N s"), "in N s · 3 streams will pause");
  if (!(left(out.countdown) >= 8)) throw new Error(`countdown starts at ${out.countdown}`);
  expect("countdown buttons", await cd.locator("button").allTextContents().then((a) => a.map(norm)), ["Now", "Abort"]);
  await wait(1500);
  const later = norm(await cd.locator(".sl-cdtoast__sub").textContent());
  if (!(left(later) < left(out.countdown) && left(later) >= 1)) throw new Error(`countdown did not move: ${out.countdown} then ${later}`);
  await shot("desk-ask-countdown");
  await app.evaluate(() => window.__slp.toast("Saved"));
  await wait(300);
  const toastTop = (await app.locator(".toasts").boundingBox()).y;
  const cdTop = (await cd.boundingBox()).y;
  out.shift = toastTop - cdTop;
  expect("toast sits 74px below the countdown", Math.round(out.shift), 74);
  await cd.getByRole("button", { name: "Abort" }).click();
  await wait(600);
  expect("abort", await app.evaluate(() => window.__ended), ["abort"]);
  expect("countdown gone", await cd.count(), 0);

  await app.evaluate(() =>
    window.__slp.countdown({ title: "Restarting the server", seconds: 10, note: "", ondone: () => window.__ended.push("done") }),
  );
  await wait(600);
  expect("no note", norm(await cd.locator(".sl-cdtoast__sub").textContent()).replace(/\d+/, "N"), "in N s");
  await wait(12000);
  expect("runs out", await app.evaluate(() => window.__ended), ["abort", "done"]);
  return out;
};
