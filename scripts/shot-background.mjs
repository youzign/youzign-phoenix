import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotsDir = resolve(__dirname, "../docs/shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5198/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--force-device-scale-factor=2"],
});
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(async () => { await document.fonts.ready; });
await sleep(1000);

// Nothing selected → Canvas panel is shown. Apply a gradient preset via store.
await page.evaluate(() => {
  const s = window.__editor.getState();
  s.select(null);
  s.applyGradientPreset(7); // blue→violet linear
  s.setBgGradientAngle(45);
});
await sleep(700);
await page.screenshot({ path: resolve(shotsDir, "background-panel.png") });
console.log("saved background-panel.png");

// Transparent toggle on → checkerboard visible behind canvas.
await page.evaluate(() => {
  window.__editor.getState().setBgTransparent(true);
});
await sleep(700);
await page.screenshot({ path: resolve(shotsDir, "background-transparent.png") });
console.log("saved background-transparent.png");

console.log("PAGE LOGS:\n" + logs.join("\n"));
await browser.close();
