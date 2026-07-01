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
await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });

// Select the local clipart fixture and zoom to 1.
await page.select("select", "clipart-local.xml");
await page.$eval('input[type="range"]', (el) => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  ).set;
  setter.call(el, "1");
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(2000);

const canvas = await page.$(".yz-canvas");
await canvas.screenshot({ path: resolve(shotsDir, "clipart.png") });
console.log("saved clipart.png");

await browser.close();
