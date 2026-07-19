// Reproduces + verifies the fix for: user-imported photos missing from
// Export PNG / dashboard thumbnails under WebKit (WKWebView on macOS).
//
// html-to-image clones `.yz-canvas` into an SVG <foreignObject>, loads that
// SVG into a new Image, and draws it to a canvas. WebKit/Safari does not
// guarantee subresource <img> elements inside a foreignObject are decoded
// when the SVG's `load` event fires, so the first capture draws large
// data-URI photo layers blank. This script builds a design with 6 large
// (>=2MB) noise data-URI photo layers laid out on a non-overlapping grid,
// then pixel-samples both the Export PNG output and the dashboard thumbnail
// output to confirm the photo regions actually contain photo content (not
// just the canvas background showing through).
//
// Must FAIL on unmodified code in WebKit (documented in the brief) and PASS
// once the shared stable-capture helper lands.
import { execFileSync, spawn } from "node:child_process";
import { webkit } from "playwright";

const PORT = 5233;
const URL = `http://127.0.0.1:${PORT}/#/`;
const CANVAS_W = 1600;
const CANVAS_H = 900;
const BG_HEX = "#123456";
const TILE_W = 440;
const TILE_H = 360;

// 3x2 grid of non-overlapping tile centers across the 1600x900 canvas.
const REGIONS = [];
for (let row = 0; row < 2; row++) {
  for (let col = 0; col < 3; col++) {
    REGIONS.push({
      cx: (CANVAS_W / 3) * (col + 0.5),
      cy: (CANVAS_H / 2) * (row + 0.5),
    });
  }
}

// Small offsets sampled around each tile's center (safely inside its
// non-overlapping half-extents of +-220 / +-180).
const OFFSETS = [
  { dx: 0, dy: 0 },
  { dx: -100, dy: 0 },
  { dx: 100, dy: 0 },
  { dx: 0, dy: -80 },
  { dx: 0, dy: 80 },
];

const log = (...a) => console.log("[e2e-export-webkit]", ...a);

execFileSync("pnpm", ["--filter", "./packages/*", "-r", "build"], { stdio: "inherit" });

const vite = spawn(
  "pnpm",
  ["--filter", "@youzign/editor", "exec", "vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
  { stdio: ["ignore", "pipe", "pipe"] }
);
let viteOutput = "";
vite.stdout.on("data", (chunk) => (viteOutput += chunk));
vite.stderr.on("data", (chunk) => (viteOutput += chunk));

async function waitForApp() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not become ready:\n${viteOutput}`);
}

/** Read a document record's `thumb` field straight out of IndexedDB. */
async function readThumb(page, docId) {
  return page.evaluate(async (id) => {
    const req = indexedDB.open("youzign-docs", 1);
    const db = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => req.result.createObjectStore("documents", { keyPath: "id" });
    });
    const tx = db.transaction("documents", "readonly");
    const get = tx.objectStore("documents").get(id);
    const rec = await new Promise((resolve, reject) => {
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return rec ? rec.thumb : undefined;
  }, docId);
}

/** Decode a data-URL image in-page and sample RGBA at design-space points,
 * scaling proportionally to the image's actual (possibly downscaled) size. */
async function samplePoints(page, dataUrl, designW, designH, bgPoint, regions, offsets) {
  return page.evaluate(
    async ({ dataUrl, designW, designH, bgPoint, regions, offsets }) => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const scaleX = img.naturalWidth / designW;
      const scaleY = img.naturalHeight / designH;
      const sample = (x, y) => {
        const px = Math.min(canvas.width - 1, Math.max(0, Math.round(x * scaleX)));
        const py = Math.min(canvas.height - 1, Math.max(0, Math.round(y * scaleY)));
        return Array.from(ctx.getImageData(px, py, 1, 1).data);
      };
      const bg = sample(bgPoint.x, bgPoint.y);
      const layers = regions.map((r) => {
        const samples = offsets.map((o) => sample(r.cx + o.dx, r.cy + o.dy));
        const diffs = samples.map(
          (s) => Math.abs(s[0] - bg[0]) + Math.abs(s[1] - bg[1]) + Math.abs(s[2] - bg[2])
        );
        const nonBgCount = diffs.filter((d) => d > 30).length;
        return { samples, diffs, nonBgCount };
      });
      return {
        imgWidth: img.naturalWidth,
        imgHeight: img.naturalHeight,
        bg,
        layers,
        dataUrlLength: dataUrl.length,
      };
    },
    { dataUrl, designW, designH, bgPoint, regions, offsets }
  );
}

function assertLayersHavePhotoContent(result, label) {
  const blankLayers = result.layers
    .map((l, i) => ({ ...l, index: i }))
    .filter((l) => l.nonBgCount === 0);
  log(
    `${label}: img=${result.imgWidth}x${result.imgHeight} bytes(base64)=${result.dataUrlLength} ` +
      `bg=${JSON.stringify(result.bg)} layers=${JSON.stringify(result.layers.map((l) => l.nonBgCount))}`
  );
  if (blankLayers.length > 0) {
    throw new Error(
      `${label}: ${blankLayers.length}/${result.layers.length} photo layers rendered as background-only ` +
        `(blank) — indices ${blankLayers.map((l) => l.index).join(", ")}. ` +
        `Sample diffs: ${JSON.stringify(blankLayers.map((l) => l.diffs))}`
    );
  }
}

let browser;
try {
  await waitForApp();
  browser = await webkit.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("console", (m) => {
    if (m.type() === "error") log("PAGE ERROR:", m.text());
  });

  await page.goto(URL, { waitUntil: "load" });
  await page.waitForSelector('[data-testid="new-design"]');
  await page.click('[data-testid="new-design"]');
  await page.waitForSelector('[data-testid="new-design-modal"]');
  await page.fill('[data-testid="custom-width"]', String(CANVAS_W));
  await page.fill('[data-testid="custom-height"]', String(CANVAS_H));
  await page.click('[data-testid="create-custom"]');
  await page.waitForFunction(() => location.hash.startsWith("#/d/"), { timeout: 10000 });
  await page.waitForFunction(
    (w) => window.__editor?.getState()?.design?.canvasWidth === w,
    CANVAS_W,
    { timeout: 10000 }
  );
  const documentId = await page.evaluate(() => window.__editor.getState().documentId);
  log("design created", documentId, `${CANVAS_W}x${CANVAS_H}`);

  // Build 6 large (>=2MB) noise photo layers on a non-overlapping 3x2 grid,
  // using the same store actions the UI uses (addPhoto + patchItemByUid).
  const addedCount = await page.evaluate(
    async ({ regions, tileW, tileH, bgHex }) => {
      function noiseDataUrl(w, h) {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        const id = ctx.createImageData(w, h);
        const buf = id.data;
        for (let i = 0; i < buf.length; i += 4) {
          buf[i] = (Math.random() * 256) | 0;
          buf[i + 1] = (Math.random() * 256) | 0;
          buf[i + 2] = (Math.random() * 256) | 0;
          buf[i + 3] = 255;
        }
        ctx.putImageData(id, 0, 0);
        return c.toDataURL("image/png");
      }
      const st = window.__editor.getState();
      st.setBgColor(bgHex);
      for (const r of regions) {
        const source = noiseDataUrl(1200, 900);
        st.addPhoto({ source, width: 1200, height: 900 });
        const uid = window.__editor.getState().selectedUids[0];
        window.__editor
          .getState()
          .patchItemByUid(uid, { xpos: r.cx, ypos: r.cy, width: tileW, height: tileH });
      }
      return window.__editor.getState().design.items.length;
    },
    { regions: REGIONS, tileW: TILE_W, tileH: TILE_H, bgHex: BG_HEX }
  );
  if (addedCount !== REGIONS.length) {
    throw new Error(`expected ${REGIONS.length} items, got ${addedCount}`);
  }

  // Confirm the source data URIs are genuinely large (>=2MB), as the brief
  // requires, and that the live editor actually shows all 6 <img> layers.
  const sourceSizes = await page.evaluate(() =>
    window.__editor.getState().design.items.map((it) => it.source?.length ?? 0)
  );
  const tooSmall = sourceSizes.filter((n) => n < 2_000_000);
  if (tooSmall.length > 0) throw new Error(`some photo sources are under 2MB: ${sourceSizes}`);
  log("photo source sizes (base64 chars):", sourceSizes);

  await page.waitForFunction(
    () => {
      const node = document.querySelector(".yz-canvas");
      if (!node) return false;
      const imgs = [...node.querySelectorAll("img")];
      return imgs.length === 6 && imgs.every((im) => im.complete && im.naturalWidth > 0);
    },
    { timeout: 20000 }
  );
  log("live canvas shows all 6 image layers");

  // --- Dashboard thumbnail path (captureDashboardThumb via the real autosave) ---
  // The autosave effect debounces 800ms after the last store change and only
  // recaptures the thumb if >5s have passed since the last capture; the
  // in-memory throttle starts at 0, so the very first debounce fire captures.
  // Checked before the export below so the two capture passes don't run
  // concurrently and contend for the same decode work.
  let thumb;
  for (let attempt = 0; attempt < 40 && !thumb; attempt++) {
    await page.waitForTimeout(500);
    thumb = await readThumb(page, documentId);
  }
  if (!thumb) throw new Error("no thumbnail was persisted for the document");
  const thumbResult = await samplePoints(
    page,
    thumb,
    CANVAS_W,
    CANVAS_H,
    { x: 20, y: 20 },
    REGIONS,
    OFFSETS
  );
  assertLayersHavePhotoContent(thumbResult, "Dashboard thumbnail");

  // --- Export PNG path (runExport, the real code the Export button calls) ---
  const exportDataUrl = await page.evaluate(async () => {
    const st = window.__editor.getState();
    return window.__runExport({
      format: "png",
      scale: 1,
      transparent: false,
      designName: st.designName,
      canvasWidth: st.design.canvasWidth,
      canvasHeight: st.design.canvasHeight,
    });
  });
  if (!exportDataUrl) throw new Error("runExport returned no data URL");
  const exportResult = await samplePoints(
    page,
    exportDataUrl,
    CANVAS_W,
    CANVAS_H,
    { x: 20, y: 20 },
    REGIONS,
    OFFSETS
  );
  assertLayersHavePhotoContent(exportResult, "Export PNG");

  log("EXPORT WEBKIT E2E OK: PNG export and dashboard thumbnail both show all 6 photo layers.");
} finally {
  await browser?.close();
  vite.kill("SIGTERM");
}
