// Visual end-to-end QA RE-RUN (qa5) for the legacy design import flow.
//
// Same 26 designs as qa3 (read straight from qa3-results.json by title, so we
// compare apples to apples), re-imported through the FIXED render pipeline
// (clipart recolor, legacy font loader, rotated-text AABB placement, canvas
// img/svg CSS clamp removal). Uses a FRESH Chrome user-data-dir so nothing
// from qa3 lingers in IndexedDB / browser cache and short-circuits the import.
//
// Run: node scripts/e2e-qa5.mjs
// Requires: pnpm --filter @youzign/editor dev  running on http://localhost:5191/
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5191/#/";
const CLAIM_URL = "https://xnxcduqzexwukehavthg.supabase.co/functions/v1/youzign-legacy-claim";
const SHOT_DIR = "docs/planning/legacy-claim-shots/qa5";
const QA3_RESULTS = "docs/planning/legacy-claim-shots/qa3/qa3-results.json";
const ACCOUNTS = ["imgllc", "mackcarbon", "7YgkgPFJ"];

const log = (...a) => console.log("[e2e-qa5]", ...a);
const shot = (n) => path.join(SHOT_DIR, n);
const slug = (s) => (s || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "untitled";

// The exact per-account title list from qa3 (source of truth for the sample).
const qa3 = JSON.parse(fs.readFileSync(QA3_RESULTS, "utf8"));
const TITLES_BY_ACCT = {};
for (const acct of qa3.accounts) {
  TITLES_BY_ACCT[acct.identifier] = acct.picks.map((p) => ({
    design_id: p.design_id, generation: p.generation, format: p.format, title: p.title, created_at: p.created_at,
  }));
}

async function inPage(page, fnBody, arg) {
  await page.evaluate(
    (body, a) => {
      window.__stash = window.__stash || {};
      window.__stash.r = undefined;
      const fn = new Function("arg", `return (async () => { ${body} })();`);
      fn(a).then(
        (v) => (window.__stash.r = { ok: true, v }),
        (e) => (window.__stash.r = { ok: false, e: String(e?.message || e) })
      );
    },
    fnBody,
    arg
  );
  await page.waitForFunction(() => window.__stash?.r !== undefined, { timeout: 40000, polling: 250 });
  const r = await page.evaluate(() => window.__stash.r);
  if (!r.ok) throw new Error("in-page: " + r.e);
  return r.v;
}

// Lookup with retry/backoff (imgllc identifier was flaky w/ occasional 404s).
async function lookupWithRetry(identifier, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(CLAIM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup", identifier }),
      });
      if (res.status === 404) { lastErr = new Error("lookup 404"); log(`lookup 404 for ${identifier}, retry ${i + 1}/${tries}`); await new Promise((r) => setTimeout(r, 1500 * (i + 1))); continue; }
      const data = await res.json();
      if (!data || !Array.isArray(data.designs)) { lastErr = new Error("no designs array"); await new Promise((r) => setTimeout(r, 1500 * (i + 1))); continue; }
      return data;
    } catch (e) { lastErr = e; log(`lookup error for ${identifier}: ${e.message}, retry ${i + 1}/${tries}`); await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  throw lastErr || new Error("lookup failed");
}

async function runAccount(page, identifier) {
  log(`=== account ${identifier} ===`);
  const acctResults = { identifier, picks: [], warnings: [] };
  const picks = TITLES_BY_ACCT[identifier].map((p) => ({ ...p }));

  // Fetch full design list (for grid header sanity + era breakdown), with retry.
  const lookupData = await lookupWithRetry(identifier);
  const allDesigns = lookupData.designs || [];
  log(`total designs: ${allDesigns.length}`);
  const byEra = {};
  for (const d of allDesigns) { const k = `${d.generation}/${d.format}`; byEra[k] = (byEra[k] || 0) + 1; }
  acctResults.totalDesigns = allDesigns.length;
  acctResults.eraBreakdown = byEra;
  log(`using qa3 title list (${picks.length}):`, picks.map((p) => `${p.title} (gen${p.generation}/${p.format})`));
  acctResults.picks = picks.map((p) => ({ design_id: p.design_id, generation: p.generation, format: p.format, title: p.title, created_at: p.created_at }));

  // Reset local IndexedDB (belt & suspenders — the fresh profile already isolates us).
  await page.goto(URL, { waitUntil: "networkidle2" });
  await inPage(page, `await new Promise((res)=>{const d=indexedDB.deleteDatabase("youzign-docs");d.onsuccess=d.onblocked=()=>res();d.onerror=()=>res();});localStorage.removeItem("youzign-docs:migrated-localstorage-v1");return true;`);
  await page.goto(URL, { waitUntil: "networkidle2" });
  await page.waitForSelector('[data-testid="new-design"]');

  // Open Backup tab -> Import modal -> lookup identifier
  await page.evaluate(() => { const t = [...document.querySelectorAll("button,a")].find((el) => /backup/i.test(el.textContent || "")); t?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((b) => /find my designs/i.test(b.textContent || "")); b?.click(); });
  await page.waitForSelector("#legacy-identifier");
  await page.type("#legacy-identifier", identifier, { delay: 12 });
  await page.evaluate(() => { const f = document.querySelector('[data-testid="legacy-import-modal"] form'); f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); });
  await page.waitForFunction(() => /Welcome back,/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent || ""), { timeout: 40000 });
  await new Promise((r) => setTimeout(r, 3000)); // let thumbnails paint

  const headerText = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-testid="legacy-import-modal"] div')].find((d) => /Welcome back,/i.test(d.textContent || ""));
    return el?.textContent || "";
  });
  log("grid header:", headerText);
  acctResults.gridHeader = headerText;

  await page.screenshot({ path: shot(`grid-${identifier}.png`), fullPage: true });

  // Capture each pick's server thumbnail from its grid card <img>.
  for (const p of picks) {
    const handle = await page.evaluateHandle((title) => {
      const cards = [...document.querySelectorAll('[data-testid="legacy-import-modal"] label')];
      const card = cards.find((l) => (l.textContent || "").includes(title));
      return card ? card.querySelector("img") : null;
    }, p.title);
    const el = handle.asElement();
    const thumbPath = shot(`${identifier}-${slug(p.title)}-thumb.png`);
    if (el) {
      try { await el.screenshot({ path: thumbPath }); p.thumbShot = true; }
      catch (e) { p.thumbShot = false; p.thumbErr = String(e.message || e); }
    } else { p.thumbShot = false; }
  }

  // Uncheck "select all", then check only our picks by title.
  await page.evaluate(() => { const sa = [...document.querySelectorAll('[data-testid="legacy-import-modal"] input[type=checkbox]')][0]; if (sa?.checked) sa.click(); });
  await new Promise((r) => setTimeout(r, 150));
  const checked = await page.evaluate((titles) => {
    let n = 0;
    const cards = [...document.querySelectorAll('[data-testid="legacy-import-modal"] label')].filter((l) => l.querySelector('input[type="checkbox"]') && l.querySelector("img,svg"));
    for (const title of titles) {
      const card = cards.find((l) => (l.textContent || "").includes(title));
      const cb = card?.querySelector('input[type="checkbox"]');
      if (cb && !cb.checked) { cb.click(); n++; }
    }
    return n;
  }, picks.map((p) => p.title));
  log("checked", checked, "of", picks.length, "grid cards");
  acctResults.checkedCount = checked;
  await page.screenshot({ path: shot(`selected-${identifier}.png`), fullPage: true });

  // Import and wait for the summary.
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-testid="legacy-import-modal"] footer button')].find((b) => /^import \d+ designs$/i.test((b.textContent || "").trim())); b?.click(); });
  await page.waitForFunction(() => /imported, .* failed/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent || ""), { timeout: 180000 });
  const summaryText = await page.evaluate(() => { const el = [...document.querySelectorAll('[data-testid="legacy-import-modal"] div')].find((d) => /\d+\s+imported,\s+\d+\s+failed/i.test(d.textContent || "")); return el?.textContent || ""; });
  const warningsText = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('[data-testid="legacy-import-modal"] div')];
    const warnBox = boxes.find((d) => /couldn.t be downloaded/i.test(d.textContent || "") && d.children.length > 0);
    return warnBox ? [...warnBox.children].map((c) => c.textContent || "").filter(Boolean) : [];
  });
  const failedNames = await page.evaluate(() => {
    const ul = [...document.querySelectorAll('[data-testid="legacy-import-modal"] ul li')];
    return ul.map((li) => li.textContent || "").filter(Boolean);
  });
  log("import summary:", summaryText);
  log("asset warnings:", warningsText);
  if (failedNames.length) log("hard failures:", failedNames);
  const m = summaryText.match(/(\d+)\s+imported,\s+(\d+)\s+failed/i);
  acctResults.import = { summaryText, imported: m ? +m[1] : 0, failed: m ? +m[2] : 0, warningsText, failedNames };
  await page.screenshot({ path: shot(`summary-${identifier}.png`), fullPage: true });

  // Close modal
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-testid="legacy-import-modal"] button')].find((b) => /^done$/i.test((b.textContent || "").trim())); b?.click(); });
  await page.waitForFunction(() => !document.querySelector('[data-testid="legacy-import-modal"]'), { timeout: 5000 });

  // Go to Designs tab, open each pick by title, screenshot the editor canvas.
  await page.evaluate(() => { const t = [...document.querySelectorAll("button,a")].find((el) => /^designs$/i.test((el.textContent || "").trim())); t?.click(); });
  await page.waitForSelector('[data-testid="design-card"]', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 500));

  for (const p of picks) {
    const opened = await page.evaluate((title) => {
      const cards = [...document.querySelectorAll('[data-testid="design-card"]')];
      const card = cards.find((c) => (c.textContent || "").includes(title));
      if (!card) return false;
      card.click();
      return true;
    }, p.title);
    p.foundInDashboard = opened;
    if (!opened) { log(`WARNING: "${p.title}" not found in dashboard after import (likely a hard failure)`); continue; }
    await page.waitForFunction(() => location.hash.startsWith("#/d/"), { timeout: 10000 });
    await page.waitForFunction(() => !!window.__editor?.getState()?.documentId, { timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2500)); // let images/svg/fonts fetch + paint
    const st = await page.evaluate(() => {
      const s = window.__editor?.getState?.();
      if (!s) return null;
      return { items: s.design?.items?.length ?? 0, w: s.design?.canvasWidth, h: s.design?.canvasHeight, bgType: s.design?.bgType };
    });
    const stage = await page.$(".yz-canvas");
    const outCanvas = shot(`${identifier}-${slug(p.title)}-canvas.png`);
    if (stage) { try { await stage.screenshot({ path: outCanvas }); } catch { await page.screenshot({ path: outCanvas, fullPage: false }); } }
    else await page.screenshot({ path: outCanvas, fullPage: false });
    p.editor = st;
    p.canvasShot = outCanvas;
    log(`opened "${p.title}" (gen${p.generation}/${p.format}) -> items=${st?.items} ${st?.w}x${st?.h} (${st?.bgType})`);
    // Back to Designs for the next one.
    await page.evaluate(() => { location.hash = "#/"; });
    await page.waitForSelector('[data-testid="design-card"]', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 400));
  }

  return acctResults;
}

fs.mkdirSync(SHOT_DIR, { recursive: true });
// FRESH, throwaway Chrome profile per run so no qa3 IndexedDB/cache leaks in.
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "yz-qa5-chrome-"));
log("fresh Chrome user-data-dir:", userDataDir);
const consoleErrors = [];
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", userDataDir, args: ["--no-sandbox"] });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 1050 });
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

const allResults = { accounts: [], userDataDir, generatedAt: new Date().toISOString() };
const runErrors = [];
try {
  for (const identifier of ACCOUNTS) {
    try {
      const r = await runAccount(page, identifier);
      allResults.accounts.push(r);
    } catch (acctErr) {
      log(`ACCOUNT ${identifier} FAILED:`, acctErr?.message || acctErr);
      runErrors.push({ identifier, error: String(acctErr?.stack || acctErr) });
      allResults.accounts.push({ identifier, failed: true, error: String(acctErr?.message || acctErr) });
    }
    fs.writeFileSync(shot("qa5-results.json"), JSON.stringify({ ...allResults, runErrors }, null, 2));
  }
  allResults.consoleErrorCount = consoleErrors.length;
  allResults.consoleErrorsSample = consoleErrors.slice(0, 30);
  allResults.runErrors = runErrors;
  fs.writeFileSync(shot("qa5-results.json"), JSON.stringify(allResults, null, 2));
  await b.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  console.log("RESULTS WRITTEN:", shot("qa5-results.json"));
  console.log("QA5 SCRIPT DONE");
} catch (err) {
  await b.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  console.error("QA5 SCRIPT FAILED", err);
  fs.writeFileSync(shot("qa5-results.json"), JSON.stringify({ ...allResults, runErrors, fatalError: String(err?.stack || err) }, null, 2));
  process.exit(1);
}
