import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotsDir = resolve(__dirname, "../docs/shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.env.BRAND_PROMPTS_URL || "http://localhost:5211/?e2e#/";
const PROMPT = "purple and electric blue accents";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => console.log("[brand-prompts-e2e]", ...args);

async function clickTab(page, label) {
  const btns = await page.$$("nav button");
  for (const b of btns) {
    const title = await page.evaluate((el) => el.getAttribute("title"), b);
    if (title === label) return b.click();
  }
  throw new Error(`tab ${label} not found`);
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
await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });

await page.evaluateOnNewDocument((prompt) => {
  localStorage.setItem(
    "youzign-next:brands",
    JSON.stringify({
      brands: [
        {
          id: "br_prompt_e2e",
          name: "Prompt Brand",
          colors: ["#7c3aed", "#2563eb"],
          fonts: { heading: "Inter", body: "Roboto" },
          prompts: [prompt],
          createdAt: 1783200000000,
        },
      ],
      activeId: "br_prompt_e2e",
    })
  );
  localStorage.setItem("youzign-next:library-keys", JSON.stringify({ fal: "mock-key" }));
}, PROMPT);

try {
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
  await page.evaluate(() => document.fonts?.ready);

  await clickTab(page, "Brand");
  await page.waitForSelector('[data-testid="brand-prompt-0"]', { timeout: 10000 });
  const brandValue = await page.$eval('[data-testid="brand-prompt-0"]', (el) => el.value);
  if (!brandValue.includes(PROMPT)) throw new Error(`brand prompt editor missing text: ${brandValue}`);
  log("brand editor contains seeded prompt");

  await clickTab(page, "Create");
  await page.waitForSelector('[data-testid="brand-prompt-chip-0"]', { timeout: 10000 });
  const chipText = await page.$eval('[data-testid="brand-prompt-chip-0"]', (el) => el.textContent || "");
  if (!chipText.includes(PROMPT)) throw new Error(`brand prompt chip missing text: ${chipText}`);
  log("create tab chip rendered");

  await page.click('[data-testid="brand-prompt-chip-0"]');
  await page.waitForFunction(
    (prompt) => document.querySelector('[data-testid="generate-prompt"]')?.value.includes(prompt),
    { timeout: 5000 },
    PROMPT
  );
  const generateValue = await page.$eval('[data-testid="generate-prompt"]', (el) => el.value);
  if (!generateValue.includes(PROMPT)) throw new Error(`generate prompt missing text: ${generateValue}`);
  log("chip appended prompt text");

  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: resolve(shotsDir, "brand-prompts.png"), fullPage: true });
  await browser.close();
  console.log("BRAND PROMPTS E2E OK");
} catch (err) {
  await browser.close();
  console.error("BRAND PROMPTS E2E FAILED", err);
  process.exit(1);
}
