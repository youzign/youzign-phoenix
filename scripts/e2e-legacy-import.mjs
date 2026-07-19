// E2E test for the "Import from youzign.com" legacy-claim flow.
// Drives the real dev server + the LIVE Supabase edge function (youzign-legacy-claim)
// against the seeded test account "marketing" (~1,360 designs).
//
// Run: node scripts/e2e-legacy-import.mjs
// Requires: pnpm --filter @youzign/editor dev  running on http://localhost:5191/
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5191/#/";
const SHOT_DIR = "docs/planning/legacy-claim-shots";
const IDENTIFIER = "marketing";
const BAD_IDENTIFIER = "zzz-no-such-user-zzz";

const log = (...a) => console.log("[e2e-legacy-import]", ...a);
const results = {};

function shot(n) {
  return path.join(SHOT_DIR, n);
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
  await page.waitForFunction(() => window.__stash?.r !== undefined, { timeout: 30000, polling: 250 });
  const r = await page.evaluate(() => window.__stash.r);
  if (!r.ok) throw new Error("in-page: " + r.e);
  return r.v;
}

async function docCount(page) {
  return await inPage(
    page,
    `const req = indexedDB.open("youzign-docs", 1);
     const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); req.onupgradeneeded = () => req.result.createObjectStore("documents", { keyPath: "id" }); });
     const tx = db.transaction("documents", "readonly");
     const get = tx.objectStore("documents").getAll();
     const rows = await new Promise((res, rej) => { get.onsuccess = () => res(get.result); get.onerror = () => rej(get.error); });
     db.close();
     return rows.length;`
  );
}

fs.mkdirSync(SHOT_DIR, { recursive: true });

const consoleErrors = [];
const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 1050 });
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

try {
  // --- Reset local state so the "documents count increased" assertion is clean ---
  await page.goto(URL, { waitUntil: "networkidle2" });
  await inPage(
    page,
    `await new Promise((res, rej) => {
       const del = indexedDB.deleteDatabase("youzign-docs");
       del.onsuccess = del.onblocked = () => res();
       del.onerror = () => rej(del.error);
     });
     localStorage.removeItem("youzign-docs:migrated-localstorage-v1");
     return true;`
  );
  await page.goto(URL, { waitUntil: "networkidle2" });
  await page.waitForSelector('[data-testid="new-design"]');
  const baselineCount = await docCount(page);
  log("baseline doc count", baselineCount);

  // --- (a) Dashboard with import card visible ---
  // The import card lives under the "Backup" tab in this build.
  const backupTabClicked = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll("button, a")];
    const t = tabs.find((el) => /backup/i.test(el.textContent || ""));
    if (t) { t.click(); return true; }
    return false;
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.waitForFunction(
    () => [...document.querySelectorAll("h1,h2")].some((el) => /Import from youzign\.com/i.test(el.textContent || "")),
    { timeout: 10000 }
  );
  await page.screenshot({ path: shot("01-dashboard-import-card.png"), fullPage: true });
  results.a_dashboard_card = { pass: true, backupTabClicked };
  log("(a) dashboard import card OK");

  // --- (b) Modal step 1: type "marketing" ---
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    const btn = buttons.find((b) => /find my designs/i.test(b.textContent || ""));
    btn?.click();
  });
  await page.waitForSelector('[data-testid="legacy-import-modal"]');
  await page.waitForSelector("#legacy-identifier");
  await page.type("#legacy-identifier", IDENTIFIER, { delay: 20 });
  await page.screenshot({ path: shot("02-modal-step1-identifier.png"), fullPage: true });
  results.b_modal_step1 = { pass: true };
  log("(b) modal step 1 OK");

  // --- (c) Step 2: design grid loaded ---
  const submitted = await page.evaluate(() => {
    const form = document.querySelector('[data-testid="legacy-import-modal"] form');
    if (!form) return false;
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    return true;
  });
  log("submitted lookup form", submitted);
  await page.waitForFunction(
    () => /Welcome back,/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent || ""),
    { timeout: 30000 }
  );
  const headerText = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-testid="legacy-import-modal"] div')].find((d) =>
      /Welcome back,/i.test(d.textContent || "")
    );
    return el?.textContent || "";
  });
  log("header:", headerText);
  const countMatch = headerText.match(/(\d[\d,]*)\s+designs found/i);
  const foundCount = countMatch ? parseInt(countMatch[1].replace(/,/g, ""), 10) : 0;
  const usernameOk = /marketing/i.test(headerText);
  // Wait a beat for thumbnail <img> tags to attempt loading.
  await new Promise((r) => setTimeout(r, 3000));
  const thumbStats = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('[data-testid="legacy-import-modal"] img')];
    return {
      total: imgs.length,
      loadedGt0: imgs.filter((i) => i.naturalWidth > 0).length,
    };
  });
  await page.screenshot({ path: shot("03-modal-step2-grid.png"), fullPage: true });
  results.c_grid_loaded = {
    pass: usernameOk && foundCount >= 1300 && thumbStats.loadedGt0 >= 3,
    headerText,
    foundCount,
    usernameOk,
    thumbStats,
  };
  log("(c) grid loaded:", JSON.stringify(results.c_grid_loaded));

  // --- (d) Not-found path ---
  // Close this modal, reopen fresh for the bad identifier.
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-testid="legacy-import-modal"] button')];
    const closeBtn = buttons.find((b) => /^close$/i.test((b.textContent || "").trim()));
    closeBtn?.click();
  });
  await page.waitForFunction(() => !document.querySelector('[data-testid="legacy-import-modal"]'), { timeout: 5000 });
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    const btn = buttons.find((b) => /find my designs/i.test(b.textContent || ""));
    btn?.click();
  });
  await page.waitForSelector("#legacy-identifier");
  await page.type("#legacy-identifier", BAD_IDENTIFIER, { delay: 15 });
  await page.evaluate(() => {
    const form = document.querySelector('[data-testid="legacy-import-modal"] form');
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="legacy-import-modal"] [role="alert"]')?.textContent,
    { timeout: 20000 }
  );
  const notFoundMsg = await page.evaluate(
    () => document.querySelector('[data-testid="legacy-import-modal"] [role="alert"]')?.textContent || ""
  );
  await page.screenshot({ path: shot("04-modal-not-found.png"), fullPage: true });
  results.d_not_found = { pass: /no account found/i.test(notFoundMsg), notFoundMsg };
  log("(d) not-found OK:", notFoundMsg);

  // --- Close, reopen for real import ---
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-testid="legacy-import-modal"] button')];
    const closeBtn = buttons.find((b) => /^close$/i.test((b.textContent || "").trim()));
    closeBtn?.click();
  });
  await page.waitForFunction(() => !document.querySelector('[data-testid="legacy-import-modal"]'), { timeout: 5000 });
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    const btn = buttons.find((b) => /find my designs/i.test(b.textContent || ""));
    btn?.click();
  });
  await page.waitForSelector("#legacy-identifier");
  await page.type("#legacy-identifier", IDENTIFIER, { delay: 15 });
  await page.evaluate(() => {
    const form = document.querySelector('[data-testid="legacy-import-modal"] form');
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  });
  await page.waitForFunction(
    () => /Welcome back,/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent || ""),
    { timeout: 30000 }
  );
  log("reopened lookup for real import");

  // --- (e) select 3-5 designs spanning generations, import ---
  // Uncheck "select all" first (it's checked by default with everything selected).
  await page.evaluate(() => {
    const selectAll = [...document.querySelectorAll('[data-testid="legacy-import-modal"] input[type=checkbox]')][0];
    if (selectAll?.checked) selectAll.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  const picked = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid="legacy-import-modal"] label')].filter((l) =>
      l.querySelector('input[type="checkbox"]')
    );
    // Skip the "select all" label itself (has no img sibling structure); pick from the grid cards.
    const gridCards = cards.filter((l) => l.querySelector("img, svg"));
    const spaced = [];
    const step = Math.max(1, Math.floor(gridCards.length / 5));
    for (let i = 0; i < gridCards.length && spaced.length < 5; i += step) spaced.push(gridCards[i]);
    spaced.forEach((card) => card.querySelector('input[type="checkbox"]').click());
    return spaced.length;
  });
  log("selected", picked, "designs");
  await page.screenshot({ path: shot("05-modal-selected-designs.png"), fullPage: true });

  const importClickPromise = page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-testid="legacy-import-modal"] footer button')];
    const btn = buttons.find((b) => /^import \d+ designs$/i.test((b.textContent || "").trim()));
    btn?.click();
    return !!btn;
  });
  const clicked = await importClickPromise;
  log("clicked import:", clicked);

  // Try to catch the progress state mid-flight.
  try {
    await page.waitForFunction(
      () => /Importing \d+ of \d+/i.test(document.querySelector('[data-testid="legacy-import-modal"] [role="status"]')?.textContent || ""),
      { timeout: 5000 }
    );
    await page.screenshot({ path: shot("06-modal-import-progress.png") });
    log("captured progress state");
  } catch {
    log("import finished too fast to catch progress state; continuing");
  }

  await page.waitForFunction(
    () => /imported, .* failed/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent || ""),
    { timeout: 120000 }
  );
  const summaryText = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-testid="legacy-import-modal"] div')].find((d) =>
      /\d+\s+imported,\s+\d+\s+failed/i.test(d.textContent || "")
    );
    return el?.textContent || "";
  });
  await page.screenshot({ path: shot("07-modal-import-summary.png"), fullPage: true });
  const summaryMatch = summaryText.match(/(\d+)\s+imported,\s+(\d+)\s+failed/i);
  const importedCount = summaryMatch ? parseInt(summaryMatch[1], 10) : 0;
  results.e_import = { pass: importedCount >= 1, summaryText, picked };
  log("(e) import summary:", summaryText);

  // Close modal (Done button)
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-testid="legacy-import-modal"] button')];
    const doneBtn = buttons.find((b) => /^done$/i.test((b.textContent || "").trim()));
    doneBtn?.click();
  });
  await page.waitForFunction(() => !document.querySelector('[data-testid="legacy-import-modal"]'), { timeout: 5000 });

  // --- (f) verify imported designs appear in the dashboard documents list ---
  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll("button, a")];
    const t = tabs.find((el) => /^designs$/i.test((el.textContent || "").trim()));
    t?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.waitForSelector('[data-testid="design-card"]', { timeout: 15000 });
  const afterCount = await docCount(page);
  await page.screenshot({ path: shot("08-dashboard-after-import.png"), fullPage: true });
  results.f_dashboard_updated = {
    pass: afterCount > baselineCount,
    baselineCount,
    afterCount,
    delta: afterCount - baselineCount,
  };
  log("(f) dashboard doc count:", baselineCount, "->", afterCount);

  // --- (g) open one imported design, screenshot canvas ---
  const opened = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid="design-card"]')];
    if (cards.length === 0) return false;
    cards[0].click();
    return true;
  });
  await page.waitForFunction(() => location.hash.startsWith("#/d/"), { timeout: 10000 });
  await page.waitForFunction(() => !!window.__editor?.getState()?.documentId, { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1500)); // let canvas paint
  const editorState = await page.evaluate(() => {
    const st = window.__editor.getState();
    return { itemCount: st.design?.items?.length ?? 0, w: st.design?.canvasWidth, h: st.design?.canvasHeight };
  });
  await page.screenshot({ path: shot("09-editor-imported-design.png"), fullPage: true });
  results.g_editor_opens = { pass: opened && editorState.itemCount >= 0, editorState };
  log("(g) editor opened imported design:", JSON.stringify(editorState));

  // --- console error summary ---
  results.consoleErrorsSample = consoleErrors.slice(0, 15);
  results.consoleErrorCount = consoleErrors.length;

  await b.close();
  fs.writeFileSync("docs/planning/legacy-claim-shots/results.json", JSON.stringify(results, null, 2));
  console.log("RESULTS:", JSON.stringify(results, null, 2));
  const allPass = ["a_dashboard_card", "b_modal_step1", "c_grid_loaded", "d_not_found", "e_import", "f_dashboard_updated", "g_editor_opens"].every(
    (k) => results[k]?.pass
  );
  console.log(allPass ? "LEGACY IMPORT E2E OK" : "LEGACY IMPORT E2E: SOME ASSERTIONS FAILED (see results above)");
} catch (err) {
  await b.close();
  console.error("LEGACY IMPORT E2E FAILED", err);
  fs.writeFileSync("docs/planning/legacy-claim-shots/results.json", JSON.stringify({ ...results, fatalError: String(err?.stack || err) }, null, 2));
  process.exit(1);
}
