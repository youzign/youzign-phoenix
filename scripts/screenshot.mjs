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
await page.setViewport({ width: 1400, height: 1100, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });

// Ensure Arvo is loaded and the image request has settled (load or 404).
await page.evaluate(async () => {
  await document.fonts.load('132px "Arvo"');
  await document.fonts.load('bold 132px "Arvo"');
  await document.fonts.ready;
});
await sleep(2500);

await page.screenshot({ path: resolve(shotsDir, "full-canvas.png") });
console.log("saved full-canvas.png");

// Toggle the XML source panel.
const checkboxes = await page.$$('input[type="checkbox"]');
if (checkboxes.length) {
  await checkboxes[0].click();
  await sleep(800);
}
await page.screenshot({ path: resolve(shotsDir, "with-xml-panel.png") });
console.log("saved with-xml-panel.png");

await browser.close();
