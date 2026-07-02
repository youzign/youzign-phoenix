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
await sleep(1200);

// Add a star shape (renders as an inline SVG so effects are clearly visible).
const shapeButtons = await page.$$('button[title="star"]');
if (shapeButtons.length) {
  await shapeButtons[0].click();
  await sleep(700);
}

// Helper: click the toggle button that sits next to a section label.
async function toggleSection(label) {
  const handle = await page.evaluateHandle((label) => {
    const spans = [...document.querySelectorAll("span")];
    const s = spans.find((x) => x.textContent.trim() === label);
    if (!s) return null;
    // the toggle button is the sibling within the same header row
    const row = s.parentElement;
    return row ? row.querySelector("button") : null;
  }, label);
  const el = handle.asElement();
  if (el) { await el.click(); await sleep(400); }
}

await toggleSection("Shadow");
await toggleSection("Border");

// Bump the border width so the outline is obvious.
await sleep(300);
const widthInput = await page.evaluateHandle(() => {
  const rows = [...document.querySelectorAll("label")];
  const r = rows.find((x) => x.textContent.includes("Width"));
  return r ? r.querySelector("input") : null;
});
const wEl = widthInput.asElement();
if (wEl) {
  await wEl.click({ clickCount: 3 });
  await wEl.type("10");
  await page.keyboard.press("Tab");
  await sleep(500);
}

await page.screenshot({ path: resolve(shotsDir, "editor-v0.2-effects.png") });
console.log("saved editor-v0.2-effects.png");
console.log("PAGE LOGS:\n" + logs.join("\n"));
await browser.close();
