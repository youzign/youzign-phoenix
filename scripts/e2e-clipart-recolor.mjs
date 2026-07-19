// Visual verification for the clipart-recolor fix. Imports the specific designs
// that QA flagged (blue/red shapes rendering gray, SVG-default colors, and the
// source-less placeholder-box column) via the LIVE legacy-claim backend, then
// screenshots each editor canvas into docs/planning/legacy-claim-shots/recolor-fix/.
// Compare the *-canvas.png here vs the *-thumb.png in ../qa3/.
//
// Run (dev server on the port below must be up):
//   pnpm --filter @youzign/editor dev
//   node scripts/e2e-clipart-recolor.mjs [port]
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = process.argv[2] || "5193";
const URL = `http://localhost:${PORT}/#/`;
const SHOT_DIR = "docs/planning/legacy-claim-shots/recolor-fix";
const TARGETS = {
  "7YgkgPFJ": ["OMS flyer back", "Boxroom Business Card", "snatchems beerfest pod", "HiQ beerfest voucher"],
  mackcarbon: ["DJ Mike Pelsis 2"],
};

fs.mkdirSync(SHOT_DIR, { recursive: true });
const log = (...a) => console.log("[recolor]", ...a);
const shot = (n) => path.join(SHOT_DIR, n);
const slug = (s) => (s || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "untitled";

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await b.newPage();
await page.setViewport({ width: 2400, height: 2800 });

async function resetDb() {
  await page.evaluate(async () => {
    await new Promise((res) => { const d = indexedDB.deleteDatabase("youzign-docs"); d.onsuccess = d.onblocked = () => res(); d.onerror = () => res(); });
    localStorage.removeItem("youzign-docs:migrated-localstorage-v1");
  });
}

const verdicts = [];
try {
  for (const [identifier, titles] of Object.entries(TARGETS)) {
    log("account", identifier);
    await page.goto(URL, { waitUntil: "networkidle2" });
    await resetDb();
    await page.goto(URL, { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-testid="new-design"]');
    await page.evaluate(() => { const t = [...document.querySelectorAll("button,a")].find((el) => /backup/i.test(el.textContent || "")); t?.click(); });
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => { const b2 = [...document.querySelectorAll("button")].find((x) => /find my designs/i.test(x.textContent || "")); b2?.click(); });
    await page.waitForSelector("#legacy-identifier");
    await page.type("#legacy-identifier", identifier, { delay: 10 });
    await page.evaluate(() => { const f = document.querySelector('[data-testid="legacy-import-modal"] form'); f.requestSubmit(); });
    await page.waitForFunction(() => /Welcome back,/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent || ""), { timeout: 40000 });
    await new Promise((r) => setTimeout(r, 1000));
    await page.evaluate(() => { const sa = [...document.querySelectorAll('[data-testid="legacy-import-modal"] input[type=checkbox]')][0]; if (sa?.checked) sa.click(); });
    await new Promise((r) => setTimeout(r, 200));
    const checked = await page.evaluate((wanted) => {
      let n = 0;
      const cards = [...document.querySelectorAll('[data-testid="legacy-import-modal"] label')].filter((l) => l.querySelector('input[type="checkbox"]') && l.querySelector("img,svg"));
      for (const title of wanted) {
        const card = cards.find((l) => (l.textContent || "").includes(title));
        const cb = card?.querySelector('input[type="checkbox"]');
        if (cb && !cb.checked) { cb.click(); n++; }
      }
      return n;
    }, titles);
    log("checked", checked, "of", titles.length);
    await page.evaluate(() => { const btn = [...document.querySelectorAll('[data-testid="legacy-import-modal"] footer button')].find((x) => /^import \d+ designs$/i.test((x.textContent || "").trim())); btn?.click(); });
    await page.waitForFunction(() => /imported, .* failed/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent || ""), { timeout: 180000 });
    await page.evaluate(() => { const btn = [...document.querySelectorAll('[data-testid="legacy-import-modal"] button')].find((x) => /^done$/i.test((x.textContent || "").trim())); btn?.click(); });
    await page.waitForFunction(() => !document.querySelector('[data-testid="legacy-import-modal"]'), { timeout: 5000 });
    await page.evaluate(() => { const t = [...document.querySelectorAll("button,a")].find((el) => /^designs$/i.test((el.textContent || "").trim())); t?.click(); });
    await page.waitForSelector('[data-testid="design-card"]', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 500));

    for (const title of titles) {
      const opened = await page.evaluate((t) => {
        const cards = [...document.querySelectorAll('[data-testid="design-card"]')];
        const card = cards.find((c) => (c.textContent || "").includes(t));
        if (!card) return false;
        card.click();
        return true;
      }, title);
      if (!opened) { log("NOT FOUND:", title); verdicts.push(`${identifier}/${title}: NOT FOUND`); continue; }
      await page.waitForFunction(() => location.hash.startsWith("#/d/"), { timeout: 10000 });
      await page.waitForFunction(() => !!window.__editor?.getState()?.documentId, { timeout: 15000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 6000));
      const stage = await page.$(".yz-canvas");
      const out = shot(`${identifier}-${slug(title)}-canvas.png`);
      if (stage) { try { await stage.screenshot({ path: out }); } catch { await page.screenshot({ path: out }); } }
      else await page.screenshot({ path: out });
      log("captured", out);
      verdicts.push(`${identifier}/${title}: captured -> ${out}`);
      await page.evaluate(() => { location.hash = "#/"; });
      await page.waitForSelector('[data-testid="design-card"]', { timeout: 15000 });
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  await b.close();
  console.log("\n=== VERDICTS ===");
  for (const v of verdicts) console.log(v);
  console.log("RECOLOR E2E DONE");
} catch (e) {
  await b.close();
  console.error("RECOLOR E2E FAILED", e);
  process.exit(1);
}
