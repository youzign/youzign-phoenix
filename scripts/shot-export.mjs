import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotsDir = resolve(__dirname, "../docs/shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5196/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(async () => { await document.fonts.ready; });
await sleep(1200);

// Expose runExport results by capturing the data URLs it returns.
// We drive the pure runExport module directly via the app's import graph
// by simulating: set prefs + click. Simpler: call the internal via window hook.
// Instead we read produced data URLs by monkeypatching HTMLAnchorElement click.
await page.evaluate(() => {
  window.__exports = [];
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.href && (this.href.startsWith("data:") || this.href.startsWith("blob:"))) {
      window.__exports.push({ download: this.download, href: this.href });
      return; // suppress actual navigation/download
    }
    return origClick.apply(this, arguments);
  };
});

const measure = async (dataUrl) => {
  return await page.evaluate((url) => {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight, len: url.length });
      img.onerror = () => res({ w: 0, h: 0, len: url.length, err: true });
      img.src = url;
    });
  }, dataUrl);
};

// Helper: set format/scale/transparent via the popover, then export.
const openPopover = async () => {
  await page.evaluate(() => {
    document.querySelector('[data-testid="export-toggle"]')?.click();
  });
  await sleep(250);
};
const clickSeg = async (label) => {
  await page.evaluate((t) => {
    const pop = document.querySelector('[data-testid="export-popover"]');
    const b = [...pop.querySelectorAll("button")].find((el) => el.textContent.trim() === t);
    b?.click();
  }, label);
  await sleep(120);
};
const runInPopover = async () => {
  await page.evaluate(() => {
    const pop = document.querySelector('[data-testid="export-popover"]');
    const b = [...pop.querySelectorAll("button")].find((el) => el.textContent.trim() === "Export");
    b?.click();
  });
  await sleep(1400);
};
const lastExport = async () => page.evaluate(() => window.__exports.at(-1));
const clearExports = async () => page.evaluate(() => { window.__exports = []; });

const results = {};

// --- PNG 1x ---
await clearExports();
await openPopover();
await clickSeg("PNG");
await clickSeg("1×");
await runInPopover();
let e = await lastExport();
results.png1 = { name: e.download, ...(await measure(e.href)) };

// --- PNG 2x ---
await openPopover();
await clickSeg("2×");
await runInPopover();
e = await lastExport();
results.png2 = { name: e.download, ...(await measure(e.href)) };

// --- JPG 1x ---
await openPopover();
await clickSeg("JPG");
await clickSeg("1×");
await runInPopover();
e = await lastExport();
results.jpg = { name: e.download, head: e.href.slice(0, 30), ...(await measure(e.href)) };

// --- PDF ---
await openPopover();
await clickSeg("PDF");
await runInPopover();
e = await lastExport();
results.pdf = { name: e.download, head: e.href.slice(0, 40), len: e.href.length };

// --- PNG transparent: screenshot the open popover ---
await openPopover();
await clickSeg("PNG");
await page.evaluate(() => {
  const pop = document.querySelector('[data-testid="export-popover"]');
  // turn on transparent switch
  const sw = pop.querySelector('[role="switch"]');
  if (sw && sw.getAttribute("aria-checked") !== "true") sw.click();
});
await sleep(200);
await page.screenshot({ path: resolve(shotsDir, "export-popover.png") });
console.log("saved export-popover.png");

// export transparent PNG and check
await clearExports();
await runInPopover();
e = await lastExport();
results.pngTransparent = { name: e.download, ...(await measure(e.href)) };

console.log("RESULTS:\n" + JSON.stringify(results, null, 2));
console.log("PAGE LOGS:\n" + logs.slice(-15).join("\n"));
await browser.close();
