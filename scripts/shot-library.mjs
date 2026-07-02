import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotsDir = resolve(__dirname, "../docs/shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5192/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--force-device-scale-factor=2"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 820, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });

async function clickTab(label) {
  const btns = await page.$$("nav button");
  for (const b of btns) {
    const t = await page.evaluate((el) => el.getAttribute("title"), b);
    if (t === label) {
      await b.click();
      return;
    }
  }
  throw new Error(`tab ${label} not found`);
}

// ---- Icons tab: search + insert ----
await clickTab("Icons");
await sleep(300);
await page.type('input[placeholder="Search icons…"]', "rocket");
await sleep(2500); // debounce + network
// click the first result to insert onto canvas
const firstIcon = await page.$(".grid button");
if (firstIcon) await firstIcon.click();
await sleep(2000); // let the inserted SVG fetch + recolor + render
await page.screenshot({ path: resolve(shotsDir, "library-icons.png") });
console.log("saved library-icons.png");

// ---- Photos tab: no-key designed state ----
await clickTab("Photos");
await sleep(600);
await page.screenshot({ path: resolve(shotsDir, "library-photos.png") });
console.log("saved library-photos.png");

await browser.close();
