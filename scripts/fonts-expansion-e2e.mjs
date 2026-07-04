import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotsDir = resolve(__dirname, "../docs/shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.env.FONTS_EXPANSION_URL || "http://localhost:5211/?e2e#/";
const CUSTOM_FONT = "Grandstander";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => console.log("[fonts-expansion-e2e]", ...args);

async function openFontPicker(page) {
  await page.waitForSelector('[data-testid="font-picker"]', { timeout: 10000 });
  await page.click('[data-testid="font-picker"]');
  await page.waitForSelector('[data-testid="font-picker-search"]', { timeout: 10000 });
}

async function replaceSearch(page, text) {
  await page.click('[data-testid="font-picker-search"]', { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("PAGE ERR:", m.text());
});
await page.setViewport({ width: 1300, height: 900, deviceScaleFactor: 2 });

try {
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
  await page.evaluate(() => document.fonts?.ready);

  await page.waitForFunction(() => window.__editor?.getState, { timeout: 10000 });
  await page.evaluate(() => window.__editor.getState().addText({ content: "Font picker E2E" }));
  await sleep(500);

  await openFontPicker(page);
  const unfilteredCount = await page.$$eval('[data-testid="font-option"]', (els) => els.length);
  if (unfilteredCount <= 200) throw new Error(`expected >200 font options, got ${unfilteredCount}`);
  log(`unfiltered option count: ${unfilteredCount}`);

  await replaceSearch(page, "Inter");
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-testid="font-option"]')].some((el) => el.textContent?.trim() === "Inter"),
    { timeout: 5000 }
  );
  log("Inter is searchable");

  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: resolve(shotsDir, "fonts-picker.png"), fullPage: true });

  await replaceSearch(page, CUSTOM_FONT);
  await page.waitForSelector('[data-testid="font-add-row"]', { timeout: 5000 });
  await page.click('[data-testid="font-add-row"]');
  await page.waitForFunction(
    (family) => document.querySelector('[data-testid="font-picker"]')?.textContent?.includes(family),
    { timeout: 15000 },
    CUSTOM_FONT
  );
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("youzign-next:custom-fonts") || "[]")
  );
  if (!stored.includes(CUSTOM_FONT)) throw new Error(`custom font missing from localStorage: ${JSON.stringify(stored)}`);
  log(`${CUSTOM_FONT} added and selected`);

  await openFontPicker(page);
  await replaceSearch(page, CUSTOM_FONT);
  await page.screenshot({ path: resolve(shotsDir, "fonts-add.png"), fullPage: true });

  await replaceSearch(page, "Zzqqxx");
  await page.waitForSelector('[data-testid="font-add-row"]', { timeout: 5000 });
  await page.click('[data-testid="font-add-row"]');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="font-add-error"]')?.textContent?.includes("Not found on Google Fonts"),
    { timeout: 15000 }
  );
  log("invalid family shows not-found error");

  await browser.close();
  console.log("FONTS EXPANSION E2E OK");
} catch (err) {
  await browser.close();
  console.error("FONTS EXPANSION E2E FAILED", err);
  process.exit(1);
}
