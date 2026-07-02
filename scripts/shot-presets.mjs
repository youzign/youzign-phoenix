import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotsDir = resolve(__dirname, "../docs/shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5194/";
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
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(async () => { await document.fonts.ready; });
await sleep(800);

const clickTab = async (title) => {
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll("nav button")].find(
      (el) => el.title === t
    );
    b?.click();
  }, title);
};

const clickByText = async (text) => {
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((el) =>
      el.textContent.trim().includes(t)
    );
    b?.click();
  }, text);
};

// 1. Photos — featured feed + category chips.
await clickTab("Photos");
await sleep(3500);
await page.screenshot({ path: resolve(shotsDir, "presets-photos.png") });
console.log("saved presets-photos.png");

// 2. Icons — default color grid + categories.
await clickTab("Icons");
await sleep(3000);
await page.screenshot({ path: resolve(shotsDir, "presets-icons.png") });
console.log("saved presets-icons.png");

// 3. Elements — text presets + insert a "Ribbon + text" combo on canvas.
await clickTab("Elements");
await sleep(600);
await clickByText("Ribbon + text");
await sleep(500);
// also drop a headline text preset for good measure
await page.screenshot({ path: resolve(shotsDir, "presets-text-shapes.png") });
console.log("saved presets-text-shapes.png");

console.log("PAGE LOGS:\n" + logs.slice(-20).join("\n"));
await browser.close();
