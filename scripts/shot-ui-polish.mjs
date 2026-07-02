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
await page.evaluate(async () => { await document.fonts.ready; });
await sleep(1500);

// Select the big title text (upper third, centered) so the properties panel
// shows the full text control set + effects.
const overlay = await page.$(".yz-canvas");
const box = await overlay.boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.32);
await sleep(600);

await page.screenshot({ path: resolve(shotsDir, "editor-ui-polish.png") });
console.log("saved editor-ui-polish.png");
console.log("PAGE LOGS:\n" + logs.join("\n"));
await browser.close();
