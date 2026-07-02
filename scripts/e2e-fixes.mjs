import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotsDir = resolve(__dirname, "../docs/shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5204/";
const FAL = process.env.FAL_KEY || "";
// A clear subject on a fairly plain background (Unsplash, CORS-enabled).
const IMG = "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=700&q=80";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--force-device-scale-factor=2"],
});
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("PAGE ERR:", m.text()); });
await page.setViewport({ width: 1400, height: 1100, deviceScaleFactor: 2 });

// Inject the fal key BEFORE the app boots.
await page.evaluateOnNewDocument((falKey) => {
  if (falKey) localStorage.setItem("youzign-next:library-keys", JSON.stringify({ fal: falKey }));
}, FAL);

await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(() => document.fonts.ready);
await sleep(1500);

// Add a real photo via the store and select it.
const uid = await page.evaluate(async (src) => {
  const store = window.__editor;
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  store.getState().addPhoto({ source: src, width: img.naturalWidth, height: img.naturalHeight });
  const st = store.getState();
  return st.selectedUids[0];
}, IMG);
console.log("added photo uid", uid);
await sleep(1200);

// Helper: center of a DOM element matching a selector (device-independent CSS px).
async function centerOf(sel) {
  return await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
}

// ---------------------------------------------------------------------------
// FIX 4: rotation HUD + snap
// ---------------------------------------------------------------------------
// The rotate handle is the cursor:grab div above the selection box.
const rot = await page.evaluate(() => {
  const els = [...document.querySelectorAll('div')].filter((d) => d.style.cursor === 'grab');
  if (!els.length) return null;
  const r = els[0].getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
if (rot) {
  const selBox = await page.evaluate(() => {
    const st = window.__editor.getState();
    return { cw: st.design.canvasWidth, ch: st.design.canvasHeight };
  });
  await page.mouse.move(rot.x, rot.y);
  await page.mouse.down();
  // Drag to roughly 45deg: move to a point to the upper-right of center.
  await page.mouse.move(rot.x + 130, rot.y + 40, { steps: 12 });
  await page.mouse.move(rot.x + 150, rot.y + 55, { steps: 6 });
  await sleep(300);
  const hud = await page.$('[data-testid="rotate-hud"]');
  console.log("rotate-hud present:", !!hud);
  await page.screenshot({ path: resolve(shotsDir, "fix-rotation-hud.png") });
  console.log("saved fix-rotation-hud.png");
  await page.mouse.up();
  await sleep(200);
}

// Reset rotation to 0 for the remaining shots.
await page.evaluate((u) => window.__editor.getState().patchItemByUid(u, { rotation: 0 }), uid);
await sleep(300);

// ---------------------------------------------------------------------------
// FIX 1: Magic Blur live preview
// ---------------------------------------------------------------------------
await page.evaluate((u) => window.__editor.getState().select(u), uid);
await sleep(400);
// Enter blur preview (same path the panel "Blur" button triggers).
await page.evaluate((u) => window.__editor.getState().beginMagicBlur(u, 14), uid);
// Wait for the preview to compute (U2-Net cutout runs locally, a few seconds).
await page.waitForFunction(() => !!window.__editor.getState().blurPreview, { timeout: 60000 }).catch(() => {});
await sleep(500);
// Nudge the amount to a strong blur to make the preview obvious.
await page.evaluate(async () => { await window.__editor.getState().setMagicBlurAmount(30); });
await sleep(600);
const bp = await page.evaluate(() => !!window.__editor.getState().blurPreview);
const overlay = await page.$('[data-testid="blur-preview"]');
console.log("blurPreview state:", bp, "overlay present:", !!overlay);
await page.screenshot({ path: resolve(shotsDir, "fix-blur-preview.png") });
console.log("saved fix-blur-preview.png");
// Cancel the blur preview (non-destructive) before the grab test.
await page.evaluate(() => window.__editor.getState().cancelMagicBlur());
await sleep(300);

// ---------------------------------------------------------------------------
// FIX 5: Magic Grab plucks (original hole-filled, subject on new layer)
// ---------------------------------------------------------------------------
if (FAL) {
  const before = await page.evaluate(() => window.__editor.getState().design.items.length);
  await page.evaluate((u) => window.__editor.getState().select(u), uid);
  await sleep(300);
  // Run the full grab pipeline (segment -> extract -> hole-fill -> compose).
  // Point ~ the subject in native image px.
  await page.evaluate(async (u) => { await window.__editor.getState().applyMagicGrab(u, 350, 300); }, uid);
  await sleep(800);
  const res = await page.evaluate(() => {
    const st = window.__editor.getState();
    return { items: st.design.items.length, err: st.magicError, sel: st.selectedUids };
  });
  console.log("GRAB result:", JSON.stringify(res));
  // Move the lifted subject aside so the hole in the original is visible.
  await page.evaluate(() => {
    const st = window.__editor.getState();
    const sub = st.selectedUids[0];
    if (sub != null) st.patchItemByUid(sub, { xpos: st.design.canvasWidth * 0.8, ypos: st.design.canvasHeight * 0.55 });
  });
  await sleep(600);
  await page.screenshot({ path: resolve(shotsDir, "fix-grab.png") });
  console.log("saved fix-grab.png");
} else {
  console.log("NO FAL_KEY — skipping grab test");
}

await browser.close();
console.log("DONE");
