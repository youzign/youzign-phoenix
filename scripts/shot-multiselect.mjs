import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotsDir = resolve(__dirname, "../docs/shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5191/";
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
await page.evaluate(async () => {
  await document.fonts.ready;
});
await sleep(1500);

const overlay = await page.$(".yz-canvas");
const box = await overlay.boundingBox();
const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

// Click the title text (upper third), then shift-click a second item (the
// group/clipart lower-right) to build a multi-selection.
const a = at(0.5, 0.32); // "THE MOUNTAINS ARE CALLING"
await page.mouse.click(a.x, a.y);
await sleep(400);

for (const [fx, fy] of [
  [0.5, 0.51], // "AND I MUST GO"
  [0.5, 0.62], // "John Muir"
]) {
  const p = at(fx, fy);
  await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up("Shift");
  await sleep(400);
}
await sleep(400);

await page.screenshot({ path: resolve(shotsDir, "editor-v0.2-multiselect.png") });
console.log("saved editor-v0.2-multiselect.png");
console.log("PAGE LOGS:\n" + logs.join("\n"));
await browser.close();
