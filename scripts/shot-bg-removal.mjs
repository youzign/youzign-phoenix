import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotsDir = resolve(__dirname, "../docs/shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5195/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--force-device-scale-factor=2", "--enable-unsafe-webgpu"],
});
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(async () => { await document.fonts.ready; });

// Build a scene: a bright backdrop rect + the demo portrait on top, so that
// removed background reveals the backdrop (proof the cut-out is transparent).
await page.evaluate(async () => {
  const s = window.__editor.getState();
  s.load(
    '<data canvas_width="640" canvas_height="640" bg_color="-1" bg_type="color"></data>',
    "bg-removal-demo"
  );
  const st = window.__editor.getState();
  st.addShape("rect", { width: 640, height: 640, fill: "#4f46e5" });
  st.addPhoto({ source: "/demo-portrait.jpg", width: 640, height: 640 });
});
await sleep(1500);

await page.screenshot({ path: resolve(shotsDir, "bg-removal-before.png") });
console.log("saved bg-removal-before.png");

// Click "Remove bg" in the properties panel.
const t0 = Date.now();
const clicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    /remove bg/i.test(b.textContent || "")
  );
  if (btn) { btn.click(); return true; }
  return false;
});
console.log("clicked Remove bg:", clicked);

// Capture an in-progress shimmer shot early.
await sleep(350);
await page.screenshot({ path: resolve(shotsDir, "bg-removal-progress.png") });

// Wait until the image source becomes a PNG data-URI (removal committed).
let elapsed = 0;
let done = false;
for (let i = 0; i < 120; i++) {
  const state = await page.evaluate(() => {
    const st = window.__editor.getState();
    const img = st.design.items.find((it) => it.type === "image");
    return {
      busy: st.bgProcessingUids.length,
      error: st.bgError,
      isPng: !!(img && String(img.source).startsWith("data:image/png")),
    };
  });
  if (i % 6 === 0) console.log(`  t=${((Date.now()-t0)/1000).toFixed(1)}s`, JSON.stringify(state));
  if (state.error) { console.log("ERROR:", JSON.stringify(state.error)); break; }
  if (state.isPng && state.busy === 0) { done = true; elapsed = Date.now() - t0; break; }
  await sleep(500);
}
console.log("removal done:", done, "elapsed(ms):", elapsed);

await sleep(600);
await page.screenshot({ path: resolve(shotsDir, "bg-removal-after.png") });
console.log("saved bg-removal-after.png");

// Warm run: model + ORT session already cached — measure pure inference time.
const warm = await page.evaluate(async () => {
  const st = window.__editor.getState();
  const img = st.design.items.find((it) => it.type === "image");
  const t = performance.now();
  st.undo(); // restore the original photo, then re-run
  await new Promise((r) => setTimeout(r, 100));
  const st2 = window.__editor.getState();
  const uid = st2.design.items.find((it) => it.type === "image")._uid;
  const t2 = performance.now();
  await st2.removeBg(uid);
  return { ms: Math.round(performance.now() - t2) };
});
console.log("warm run (ms):", JSON.stringify(warm));

// Assert transparency: read corner + centre alpha from the cut-out PNG.
const pixels = await page.evaluate(async () => { try {
  const st = window.__editor.getState();
  const img = st.design.items.find((it) => it.type === "image");
  if (!img) return null;
  const el = new Image();
  await new Promise((res, rej) => { el.onload = res; el.onerror = rej; el.src = img.source; });
  const c = document.createElement("canvas");
  c.width = el.naturalWidth; c.height = el.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(el, 0, 0);
  const at = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];
  const w = c.width, h = c.height;
  // sample a block for a robust mean
  const cornerMean = (x0, y0) => {
    let s = 0, n = 0;
    for (let dx = 0; dx < 10; dx++) for (let dy = 0; dy < 10; dy++) { s += at(x0 + dx, y0 + dy); n++; }
    return s / n;
  };
  return {
    w, h,
    tl: cornerMean(0, 0),
    tr: cornerMean(w - 10, 0),
    bl: cornerMean(0, h - 10),
    br: cornerMean(w - 10, h - 10),
    centre: at((w / 2) | 0, (h / 2) | 0),
    lowerCentre: at((w / 2) | 0, (h * 0.75) | 0), // shirt area — should be opaque
  };
} catch (e) { return { err: String(e) }; } });
console.log("PIXEL ALPHA:", JSON.stringify(pixels));

console.log("PAGE LOGS:\n" + logs.slice(-40).join("\n"));
await browser.close();
