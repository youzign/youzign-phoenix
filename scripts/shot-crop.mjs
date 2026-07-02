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

await page.select("select", "crop-curve.xml");
await page.evaluate(async () => { await document.fonts.ready; });
await sleep(1500);

// Double-click the image (lower-centre) to enter crop mode.
const canvas = await page.$(".yz-canvas");
const box = await canvas.boundingBox();
const ix = box.x + box.width * 0.5;
const iy = box.y + box.height * 0.683;
await page.mouse.click(ix, iy, { clickCount: 2 });
await sleep(700);

// Nudge the SE handle inward a touch so the crop rect reads as an active edit.
// (handles live on the crop rect; drag the bottom-right one up-left.)
await page.mouse.move(ix + box.width * 0.38 * 0.5, iy + box.height * 0.13);
await sleep(200);

await page.screenshot({ path: resolve(shotsDir, "editor-v0.2-crop.png") });
console.log("saved editor-v0.2-crop.png");
console.log("PAGE LOGS:\n" + logs.join("\n"));
await browser.close();
