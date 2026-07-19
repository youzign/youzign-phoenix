// Visual end-to-end QA for the legacy design import flow (render fidelity,
// not plumbing) against three REAL seeded customer accounts on the LIVE
// (new) Supabase backend.
//
// For each account: screenshot the source-of-truth grid, import a mixed
// sample of designs (early/recent dates, XML/JSON eras, layout-rich
// thumbnails), open each imported design in the editor, and screenshot the
// canvas next to its grid thumbnail so a human can judge fidelity.
//
// Run: node scripts/e2e-qa3.mjs
// Requires: pnpm --filter @youzign/editor dev  running on http://localhost:5191/
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5191/#/";
const CLAIM_URL = "https://xnxcduqzexwukehavthg.supabase.co/functions/v1/youzign-legacy-claim";
const SHOT_DIR = "docs/planning/legacy-claim-shots/qa3";
const ACCOUNTS = ["imgllc", "mackcarbon", "7YgkgPFJ"];
const SAMPLE_SIZE = 9;

const log = (...a) => console.log("[e2e-qa3]", ...a);
const shot = (n) => path.join(SHOT_DIR, n);
const slug = (s) => (s || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "untitled";

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

// --- Build a mixed sample for one account: earliest, latest, and a spread
// across the middle, favoring distinct formats/generations and unique
// titles (needed to match grid cards by text later). ---
function pickSample(designs, n) {
  const freq = {};
  for (const d of designs) { const t = (d.title || "").trim(); if (t) freq[t] = (freq[t] || 0) + 1; }
  const unique = designs.filter((d) => { const t = (d.title || "").trim(); return t && freq[t] === 1; });
  const sorted = [...unique].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const chosen = [];
  const seen = new Set();
  const add = (d) => {
    if (!d) return;
    const k = `${d.generation}:${d.design_id}`;
    if (seen.has(k)) return;
    seen.add(k);
    chosen.push(d);
  };
  // 2 earliest, 2 latest
  add(sorted[0]);
  add(sorted[1]);
  add(sorted[sorted.length - 1]);
  add(sorted[sorted.length - 2]);
  // then spread across eras/formats present in the middle
  const eras = {};
  for (const d of sorted) { const k = `${d.generation}/${d.format}`; (eras[k] ||= []).push(d); }
  const eraKeys = Object.keys(eras);
  let round = 0;
  while (chosen.length < n && round < 20) {
    for (const k of eraKeys) {
      if (chosen.length >= n) break;
      const bucket = eras[k];
      const idx = Math.floor((round + 1) * bucket.length / (eraKeys.length + 2)) % bucket.length;
      add(bucket[idx]);
    }
    round++;
  }
  // fallback: fill from full sorted spread if still short
  if (chosen.length < n) {
    const step = Math.max(1, Math.floor(sorted.length / n));
    for (let i = 0; i < sorted.length && chosen.length < n; i += step) add(sorted[i]);
  }
  return chosen.slice(0, n);
}

async function runAccount(page, identifier) {
  log(`=== account ${identifier} ===`);
  const acctResults = { identifier, picks: [], warnings: [] };

  // Fetch full design list directly (fast, matches what the UI will fetch).
  const lookupRes = await fetch(CLAIM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "lookup", identifier }),
  });
  const lookupData = await lookupRes.json();
  const allDesigns = lookupData.designs || [];
  log(`total designs: ${allDesigns.length}`);
  const byEra = {};
  for (const d of allDesigns) { const k = `${d.generation}/${d.format}`; byEra[k] = (byEra[k] || 0) + 1; }
  acctResults.totalDesigns = allDesigns.length;
  acctResults.eraBreakdown = byEra;

  const picks = pickSample(allDesigns, SAMPLE_SIZE);
  log(`sampled ${picks.length}:`, picks.map((p) => `${p.title} (gen${p.generation}/${p.format}, ${p.created_at.slice(0, 10)})`));
  acctResults.picks = picks.map((p) => ({
    design_id: p.design_id,
    generation: p.generation,
    format: p.format,
    title: p.title,
    created_at: p.created_at,
  }));

  // Reset local IndexedDB so imported-doc assertions/dashboard views are clean per account.
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
const consoleErrors = [];
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 1050 });
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

const allResults = { accounts: [] };
try {
  for (const identifier of ACCOUNTS) {
    const r = await runAccount(page, identifier);
    allResults.accounts.push(r);
    fs.writeFileSync(shot("qa3-results.json"), JSON.stringify(allResults, null, 2));
  }
  allResults.consoleErrorCount = consoleErrors.length;
  allResults.consoleErrorsSample = consoleErrors.slice(0, 30);
  fs.writeFileSync(shot("qa3-results.json"), JSON.stringify(allResults, null, 2));
  await b.close();
  console.log("RESULTS WRITTEN:", shot("qa3-results.json"));
  console.log("QA3 SCRIPT DONE");
} catch (err) {
  await b.close();
  console.error("QA3 SCRIPT FAILED", err);
  fs.writeFileSync(shot("qa3-results.json"), JSON.stringify({ ...allResults, fatalError: String(err?.stack || err) }, null, 2));
  process.exit(1);
}
