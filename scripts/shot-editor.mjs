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

// Click a title text item near the top-center of the canvas to select it.
const overlay = await page.$(".yz-canvas");
const box = await overlay.boundingBox();
// select the big title (roughly upper third, centered)
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.32);
await sleep(600);

// Add a star shape from the Shapes tab (Shapes is the default tab).
const shapeButtons = await page.$$('button[title="star"]');
if (shapeButtons.length) {
  await shapeButtons[0].click();
  await sleep(600);
}

// Re-select the title text so a selection with handles is visible in the shot.
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.32);
await sleep(500);

await page.screenshot({ path: resolve(shotsDir, "editor-v0.png") });
console.log("saved editor-v0.png");
console.log("PAGE LOGS:\n" + logs.join("\n"));
await browser.close();
