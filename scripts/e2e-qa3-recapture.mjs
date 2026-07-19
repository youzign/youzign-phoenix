// Recapture helper for e2e-qa3: re-imports a subset of designs per account and
// screenshots the editor canvas with a LARGE viewport so tall canvases are
// captured without the editor UI overlapping the element screenshot.
// Run: node scripts/e2e-qa3-recapture.mjs
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5191/#/";
const SHOT_DIR = "docs/planning/legacy-claim-shots/qa3";
const TARGETS = {
  imgllc: ["Kindle cover e", "VirtualCombinationLockContactUS", "Inform"],
  mackcarbon: ["Sales 3", "15x100 mtb vork 2021 grijze achtergrond", "BOTTLE CAGES FRONT PIC"],
  "7YgkgPFJ": ["Boxroom Pineapple", "OMS flyer back", "Unl eng v spain", "snatchems beerfest pod", "HiQ beerfest voucher"],
};

const log = (...a) => console.log("[qa3-recapture]", ...a);
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
      if (!opened) { log("NOT FOUND:", title); continue; }
      await page.waitForFunction(() => location.hash.startsWith("#/d/"), { timeout: 10000 });
      await page.waitForFunction(() => !!window.__editor?.getState()?.documentId, { timeout: 15000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 6000)); // generous wait for asset fetch + paint
      const stage = await page.$(".yz-canvas");
      const out = shot(`${identifier}-${slug(title)}-canvas.png`);
      if (stage) { try { await stage.screenshot({ path: out }); } catch { await page.screenshot({ path: out }); } }
      else await page.screenshot({ path: out });
      log("recaptured", out);
      await page.evaluate(() => { location.hash = "#/"; });
      await page.waitForSelector('[data-testid="design-card"]', { timeout: 15000 });
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  await b.close();
  console.log("QA3 RECAPTURE DONE");
} catch (e) {
  await b.close();
  console.error("QA3 RECAPTURE FAILED", e);
  process.exit(1);
}
