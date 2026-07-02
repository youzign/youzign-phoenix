import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotsDir = resolve(__dirname, "../docs/shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.env.SHOT_URL || "http://localhost:5193/";
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
    if (t === label) return b.click();
  }
  throw new Error(`tab ${label} not found`);
}

// ---- Create tab: no-key connect state + Dezygn bridge card ----
await clickTab("Create");
await sleep(500);
await page.screenshot({ path: resolve(shotsDir, "generate-connect.png") });
console.log("saved generate-connect.png");

// ---- Connected state with a MOCKED fal fetch (no real key available) ----
// Seed the localStorage key so the panel enters connected mode, and stub
// fetch so "Generate" returns deterministic placeholder images.
await page.evaluate(() => {
  const keys = JSON.parse(
    localStorage.getItem("youzign-next:library-keys") || "{}"
  );
  keys.fal = "mock-key-for-screenshot";
  localStorage.setItem("youzign-next:library-keys", JSON.stringify(keys));

  const real = window.fetch;
  window.fetch = (url, opts) => {
    if (typeof url === "string" && url.includes("fal.run")) {
      // 1x1 indigo-ish PNG data URLs so the grid renders without network.
      const swatch = (hue) =>
        `data:image/svg+xml;utf8,${encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue},70%,55%)'/><stop offset='1' stop-color='hsl(${hue + 40},70%,35%)'/></linearGradient></defs><rect width='512' height='512' fill='url(#g)'/></svg>`
        )}`;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            seed: 7,
            images: [{ url: swatch(245), width: 1024, height: 1024 }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }
    return real(url, opts);
  };
});

// Re-enter the tab so React re-reads the key and shows the connected UI.
await clickTab("Shapes");
await sleep(150);
await clickTab("Create");
await sleep(400);
await page.type("textarea", "a minimal indigo gradient poster background");
await sleep(200);
// click Generate (the accent button labelled Generate)
const genBtn = await page.evaluateHandle(() => {
  return [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === "Generate"
  );
});
await genBtn.asElement().click();
await sleep(1200); // mocked fetch + insert render

await page.screenshot({ path: resolve(shotsDir, "generate-result.png") });
console.log("saved generate-result.png (MOCKED fetch — no real fal key in env)");

await browser.close();
