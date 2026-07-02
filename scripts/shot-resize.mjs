import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotsDir = resolve(__dirname, "../docs/shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5197/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(async () => { await document.fonts.ready; });
await sleep(1500);

const before = await page.evaluate(() => {
  const d = window.__editor.getState().design;
  return { w: d.canvasWidth, h: d.canvasHeight, items: d.items.length };
});

// 1) open the resize popover + screenshot
await page.evaluate(() => document.querySelector('[data-testid="resize-toggle"]')?.click());
await sleep(400);
await page.screenshot({ path: resolve(shotsDir, "canvas-resize-popover.png") });
console.log("saved canvas-resize-popover.png");

// 2) click the Instagram Story / Reel preset (scale toggle is ON by default)
await page.evaluate(() => {
  const list = document.querySelector('[data-testid="resize-list"]');
  const b = [...list.querySelectorAll("button")].find((el) =>
    el.textContent.includes("Instagram Story")
  );
  b?.click();
});
await sleep(1500);

const after = await page.evaluate(() => {
  const d = window.__editor.getState().design;
  return {
    w: d.canvasWidth,
    h: d.canvasHeight,
    items: d.items.map((it) => ({
      type: it.type,
      xpos: it.xpos,
      ypos: it.ypos,
      width: it.width,
      height: it.height,
    })),
  };
});

await sleep(600);
await page.screenshot({ path: resolve(shotsDir, "canvas-resize-after.png") });
console.log("saved canvas-resize-after.png");

console.log("BEFORE:", JSON.stringify(before));
console.log("AFTER:", JSON.stringify(after, null, 2));
console.log("PAGE LOGS:\n" + logs.slice(-15).join("\n"));
await browser.close();
