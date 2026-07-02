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
await sleep(1200);

const overlay = await page.$(".yz-canvas");
const box = await overlay.boundingBox();
const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

// Select the title text item.
const a = at(0.5, 0.32);
await page.mouse.click(a.x, a.y);
await sleep(400);

// Open the font dropdown, filter to Pacifico, and apply it (canvas updates).
const openPicker = async () => (await page.$('aside button[style*="font-family"]'));
let picker = await openPicker();
await picker.click();
await sleep(400);
await page.keyboard.type("Pacifico");
await sleep(600);
// Click the matching option.
const applied = await page.evaluate(() => {
  const opt = [...document.querySelectorAll("aside li button")].find(
    (b) => b.textContent.trim() === "Pacifico"
  );
  if (opt) { opt.click(); return true; }
  return false;
});
await sleep(1500); // let the webfont load + canvas re-render

// Reopen the picker so the shot shows the open dropdown + changed font.
picker = await openPicker();
await picker.click();
await sleep(800);
console.log("applied Pacifico:", applied);

await page.screenshot({ path: resolve(shotsDir, "editor-v0.2-fontpicker.png") });
console.log("saved editor-v0.2-fontpicker.png");
console.log("PAGE LOGS:\n" + logs.join("\n"));
await browser.close();
