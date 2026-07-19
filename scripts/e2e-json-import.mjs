// Fidelity E2E for the JSON-format legacy-design import.
//
// Drives the real dev server + the LIVE Supabase edge function
// (youzign-legacy-claim) against the seeded test account "marketing". Picks 3
// real JSON-format ("Newer format") designs, imports them through the live UI,
// opens each in the editor, and screenshots the canvas side-by-side with the
// design's server-rendered thumbnail so fidelity can be judged.
//
// Run: node scripts/e2e-json-import.mjs
// Requires: pnpm --filter @youzign/editor dev  running on http://localhost:5191/
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5191/#/";
const CLAIM_URL = "https://vpklpenoffkvztqosbds.supabase.co/functions/v1/youzign-legacy-claim";
const SHOT_DIR = "docs/planning/legacy-claim-shots";
const IDENTIFIER = "marketing";
const WANT = 6;

const log = (...a) => console.log("[e2e-json-import]", ...a);
const shot = (n) => path.join(SHOT_DIR, n);
const slug = (s) => (s || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "untitled";
const results = { picks: [] };

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

fs.mkdirSync(SHOT_DIR, { recursive: true });
const consoleErrors = [];
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 1050 });
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

try {
  // Reset local docs so the imported-count assertion is clean.
  await page.goto(URL, { waitUntil: "networkidle2" });
  await inPage(page, `await new Promise((res)=>{const d=indexedDB.deleteDatabase("youzign-docs");d.onsuccess=d.onblocked=()=>res();d.onerror=()=>res();});localStorage.removeItem("youzign-docs:migrated-localstorage-v1");return true;`);
  await page.goto(URL, { waitUntil: "networkidle2" });
  await page.waitForSelector('[data-testid="new-design"]');

  // --- Pick 3 JSON-format designs. Prefer a curated set of OLDER designs whose
  // assets are s3-hosted (so the rewrite+inline pipeline covers them) and which
  // span text-only, text+image+clipart, and gradient — a meaningful fidelity
  // comparison. Fall back to newest distinctly-titled JSON designs. ---
  // 14600068 darkknight, 12549735 tamoservices, 12584762 Logo demo: designs
  // whose items carry REAL (non-identity) matrix transforms with stale
  // xpos/ypos — the matrix-geometry regression cases. The other three are the
  // original fidelity picks (also matrix-bearing) kept for no-regression.
  const PREFERRED_IDS = [14600068, 12549735, 12584762, 11903188, 12369123, 12573336];
  const picks = await inPage(page, `
    const res = await fetch(${JSON.stringify(CLAIM_URL)}, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"lookup",identifier:${JSON.stringify(IDENTIFIER)}})});
    const data = await res.json();
    const all = data.designs || [];
    const json = all.filter(d => d.format==="json");
    const prefIds = ${JSON.stringify(PREFERRED_IDS)};
    const chosen = [];
    for (const id of prefIds) { const d = json.find(x => x.design_id===id && x.thumb_url); if (d) chosen.push(d); }
    if (chosen.length < ${WANT}) {
      const freq = {};
      for (const d of all) { const t=(d.title||"").trim(); if(t) freq[t]=(freq[t]||0)+1; }
      for (const d of json) {
        if (chosen.length >= ${WANT}) break;
        const t=(d.title||"").trim();
        if (t && freq[t]===1 && d.thumb_url && !chosen.includes(d)) chosen.push(d);
      }
    }
    return chosen.slice(0, ${WANT}).map(d => ({design_id:d.design_id, generation:d.generation, title:(d.title||"Untitled").trim(), thumb_url:d.thumb_url}));
  `);
  log("picked JSON designs:", JSON.stringify(picks, null, 2));
  if (picks.length < WANT) throw new Error(`only found ${picks.length} distinctly-titled JSON designs`);
  results.picks = picks;

  // --- Open the import modal (under the "Backup" tab) and run the lookup ---
  await page.evaluate(() => { const t=[...document.querySelectorAll("button,a")].find(el=>/backup/i.test(el.textContent||"")); t?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(b=>/find my designs/i.test(b.textContent||"")); b?.click(); });
  await page.waitForSelector("#legacy-identifier");
  await page.type("#legacy-identifier", IDENTIFIER, { delay: 15 });
  await page.evaluate(() => { const f=document.querySelector('[data-testid="legacy-import-modal"] form'); f.requestSubmit?f.requestSubmit():f.dispatchEvent(new Event("submit",{cancelable:true,bubbles:true})); });
  await page.waitForFunction(() => /Welcome back,/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent||""), { timeout: 40000 });
  await new Promise((r) => setTimeout(r, 2500)); // let thumbnails paint

  // --- Capture each pick's server thumbnail from its grid card <img> ---
  for (const p of picks) {
    const handle = await page.evaluateHandle((title) => {
      const cards = [...document.querySelectorAll('[data-testid="legacy-import-modal"] label')];
      const card = cards.find((l) => (l.textContent || "").includes(title));
      return card ? card.querySelector("img") : null;
    }, p.title);
    const el = handle.asElement();
    if (el) {
      try { await el.screenshot({ path: shot(`json-${slug(p.title)}-thumb.png`) }); p.thumbShot = true; }
      catch (e) { p.thumbShot = false; p.thumbErr = String(e.message || e); }
    } else { p.thumbShot = false; }
  }

  // --- Uncheck "select all", then check only our 3 picks by title ---
  await page.evaluate(() => { const sa=[...document.querySelectorAll('[data-testid="legacy-import-modal"] input[type=checkbox]')][0]; if(sa?.checked) sa.click(); });
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
  log("checked", checked, "grid cards");
  await page.screenshot({ path: shot("json-00-selected.png"), fullPage: true });

  // --- Import and wait for the summary ---
  await page.evaluate(() => { const b=[...document.querySelectorAll('[data-testid="legacy-import-modal"] footer button')].find(b=>/^import \d+ designs$/i.test((b.textContent||"").trim())); b?.click(); });
  await page.waitForFunction(() => /imported, .* failed/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent||""), { timeout: 120000 });
  const summaryText = await page.evaluate(() => { const el=[...document.querySelectorAll('[data-testid="legacy-import-modal"] div')].find(d=>/\d+\s+imported,\s+\d+\s+failed/i.test(d.textContent||"")); return el?.textContent||""; });
  log("import summary:", summaryText);
  const m = summaryText.match(/(\d+)\s+imported,\s+(\d+)\s+failed/i);
  results.import = { summaryText, imported: m ? +m[1] : 0, failed: m ? +m[2] : 0 };

  // Close modal
  await page.evaluate(() => { const b=[...document.querySelectorAll('[data-testid="legacy-import-modal"] button')].find(b=>/^done$/i.test((b.textContent||"").trim())); b?.click(); });
  await page.waitForFunction(() => !document.querySelector('[data-testid="legacy-import-modal"]'), { timeout: 5000 });

  // --- Go to Designs, open each pick by title, screenshot the editor canvas ---
  await page.evaluate(() => { const t=[...document.querySelectorAll("button,a")].find(el=>/^designs$/i.test((el.textContent||"").trim())); t?.click(); });
  await page.waitForSelector('[data-testid="design-card"]', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));

  for (const p of picks) {
    const opened = await page.evaluate((title) => {
      const cards = [...document.querySelectorAll('[data-testid="design-card"]')];
      const card = cards.find((c) => (c.textContent || "").includes(title)) || cards[0];
      if (!card) return false;
      card.click();
      return true;
    }, p.title);
    await page.waitForFunction(() => location.hash.startsWith("#/d/"), { timeout: 10000 });
    await page.waitForFunction(() => !!window.__editor?.getState()?.documentId, { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 2500)); // let images/svg clipart fetch + paint
    const st = await page.evaluate(() => { const s = window.__editor.getState(); return { items: s.design?.items?.length ?? 0, w: s.design?.canvasWidth, h: s.design?.canvasHeight, bgType: s.design?.bgType }; });
    // Screenshot just the rendered design canvas (.yz-canvas) if present, else full page.
    const stage = await page.$(".yz-canvas");
    const outCanvas = shot(`json-${slug(p.title)}-canvas.png`);
    if (stage) { try { await stage.screenshot({ path: outCanvas }); } catch { await page.screenshot({ path: outCanvas, fullPage: false }); } }
    else await page.screenshot({ path: outCanvas, fullPage: false });
    p.editor = st;
    p.canvasShot = outCanvas;
    p.opened = opened;
    log(`opened "${p.title}" -> items=${st.items} ${st.w}x${st.h} (${st.bgType})`);
    // darkknight regression: select the first text item and screenshot the
    // selection box vs the glyphs (they must coincide).
    if (/darkknight/i.test(p.title)) {
      const selected = await page.evaluate(() => {
        const st = window.__editor.getState();
        const t = st.design.items.find((i) => i.type === "text");
        if (!t) return null;
        st.select(t._uid);
        return { content: t.content, mcWidth: t.mcWidth, textAreaWidth: t.textAreaWidth, xpos: t.xpos, ypos: t.ypos };
      });
      await new Promise((r) => setTimeout(r, 600));
      await page.screenshot({ path: shot("json-darkknight-text-selection.png"), fullPage: false });
      p.textSelection = selected;
      await page.evaluate(() => window.__editor.getState().select(null));
      log("darkknight text selection:", JSON.stringify(selected));
    }
    // Back to Designs for the next one.
    await page.evaluate(() => { history.length; location.hash = "#/"; });
    await page.waitForSelector('[data-testid="design-card"]', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 400));
  }

  // --- Build a side-by-side comparison HTML ---
  const rows = picks.map((p) => `
    <section>
      <h2>${p.title} — ${p.editor?.items ?? "?"} items, ${p.editor?.w ?? "?"}×${p.editor?.h ?? "?"} (${p.editor?.bgType ?? "?"})</h2>
      <div class="pair">
        <figure><figcaption>Server thumbnail (source of truth)</figcaption><img src="json-${slug(p.title)}-thumb.png"></figure>
        <figure><figcaption>Imported → editor canvas</figcaption><img src="json-${slug(p.title)}-canvas.png"></figure>
      </div>
    </section>`).join("\n");
  fs.writeFileSync(shot("json-compare.html"),
    `<!doctype html><meta charset=utf8><title>JSON import fidelity</title><style>body{font:14px system-ui;margin:24px;background:#111;color:#eee}.pair{display:flex;gap:16px}figure{margin:0;flex:1}img{max-width:100%;border:1px solid #333;background:#fff}figcaption{color:#999;margin-bottom:6px}h2{font-size:15px;border-top:1px solid #333;padding-top:16px}</style><h1>JSON legacy import — fidelity comparison</h1>${rows}`);

  results.consoleErrorCount = consoleErrors.length;
  results.consoleErrorsSample = consoleErrors.slice(0, 15);
  await b.close();
  fs.writeFileSync(shot("json-results.json"), JSON.stringify(results, null, 2));
  console.log("RESULTS:", JSON.stringify(results, null, 2));
  const ok = results.import?.imported >= WANT && picks.every((p) => p.opened && p.editor?.items >= 0);
  console.log(ok ? "JSON IMPORT E2E OK" : "JSON IMPORT E2E: CHECK RESULTS");
} catch (err) {
  await b.close();
  console.error("JSON IMPORT E2E FAILED", err);
  fs.writeFileSync(shot("json-results.json"), JSON.stringify({ ...results, fatalError: String(err?.stack || err) }, null, 2));
  process.exit(1);
}
