import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.resolve(root, "apps/editor/public/help");
const starterXmlPath = path.resolve(root, "apps/editor/public/starter/youzign-starter.xml");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ORIGIN = "http://localhost:5211";
const URL = `${ORIGIN}/?e2e#/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[help-shots]", ...a);
const warn = (...a) => console.warn("[help-shots] WARNING:", ...a);

const starterXml = fs.readFileSync(starterXmlPath, "utf8");

const HELP_FILES = [
  "dashboard.png",
  "editor-overview.png",
  "pages.png",
  "panels-photos.png",
  "panels-text.png",
  "brand-kit.png",
  "ai-tools.png",
  "remove-bg.png",
  "backgrounds.png",
  "resize.png",
  "export.png",
  "backup.png",
];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function makePng(file, width, height) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const i = 1 + x * 4;
      row[i] = Math.round(88 + (x / width) * 100);
      row[i + 1] = Math.round(70 + (y / height) * 70);
      row[i + 2] = Math.round(190 + ((x + y) / (width + height)) * 55);
      row[i + 3] = 255;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
      chunk("IEND", Buffer.alloc(0)),
    ])
  );
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-webgpu"],
});

const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

async function inPage(fnBody, arg) {
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

async function seedFalKey() {
  if (!process.env.FAL_KEY) return false;
  await page.evaluate((key) => {
    localStorage.setItem("youzign-next:library-keys", JSON.stringify({ fal: key }));
  }, process.env.FAL_KEY);
  return true;
}

async function resetLocalDocs() {
  await inPage(
    `await new Promise((res, rej) => {
       const del = indexedDB.deleteDatabase("youzign-docs");
       del.onsuccess = del.onblocked = () => res();
       del.onerror = () => rej(del.error);
     });
     localStorage.removeItem("youzign-docs:migrated-localstorage-v1");
     return true;`
  );
}

async function waitForApp() {
  await page.waitForSelector('[data-testid="new-design"]', { timeout: 30000 });
}

async function waitForEditor() {
  await page.waitForFunction(() => window.__editor?.getState, { timeout: 30000 });
  await page.waitForSelector('[data-testid="editor-workspace"]', { timeout: 30000 });
}

async function createEditorShell() {
  if (page.url().includes("#/d/")) return;
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
  await waitForApp();
  await page.click('[data-testid="new-design"]');
  await page.waitForSelector('[data-testid="new-design-modal"]', { timeout: 10000 });
  await page.click('[data-testid="preset-grid"] button');
  await page.waitForFunction(() => location.hash.startsWith("#/d/"), { timeout: 10000 });
  await waitForEditor();
}

async function loadStarterDesign() {
  await createEditorShell();
  await page.evaluate((xml) => {
    const st = window.__editor.getState();
    st.load(xml, "Youzign starter help shot");
    st.setZoom(0.58);
    st.select(null);
  }, starterXml);
  await waitForDesignPaint();
}

async function loadBlankDesign(name = "Help shot") {
  await createEditorShell();
  await page.evaluate((shotName) => {
    const st = window.__editor.getState();
    st.load('<data canvas_width="1080" canvas_height="1080" bg_color="-1" bg_type="color"></data>', shotName);
    st.setZoom(0.58);
    st.select(null);
  }, name);
  await waitForDesignPaint({ requireItems: false });
}

async function clickButtonText(text) {
  const clicked = await page.evaluate((label) => {
    const buttons = [...document.querySelectorAll("button")];
    const button = buttons.find((b) => b.textContent.trim() === label || b.getAttribute("title") === label);
    if (!button) return false;
    button.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`button not found: ${text}`);
  await waitForUiSettle();
}

async function waitForUiSettle() {
  await page.evaluate(async () => {
    if (document.fonts) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await sleep(150);
}

async function waitForImages() {
  await page.waitForFunction(
    async () => {
      if (document.fonts) await document.fonts.ready;
      const imgs = [...document.images];
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          });
        })
      );
      return imgs.every((img) => img.complete);
    },
    { timeout: 45000, polling: 250 }
  );
}

async function waitForCanvasProbe({ requireItems = true } = {}) {
  await page.waitForFunction(
    (opts) => {
      const canvas = document.querySelector(".yz-canvas");
      const workspace = document.querySelector('[data-testid="editor-workspace"]');
      if (!canvas || !workspace) return true;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 120) return false;

      const state = window.__editor?.getState?.();
      if (opts.requireItems && (!state || state.design.items.length === 0)) return false;

      const visibleMedia = [...canvas.querySelectorAll("img, svg, canvas")].some((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 20 && r.height > 20;
      });
      const visibleText = [...canvas.querySelectorAll("*")].some((el) => {
        const text = (el.textContent || "").trim();
        const r = el.getBoundingClientRect();
        return text.length > 0 && r.width > 20 && r.height > 12;
      });
      const visibleCanvasPixels = [...canvas.querySelectorAll("canvas")].some((el) => {
        try {
          const ctx = el.getContext("2d", { willReadFrequently: true });
          if (!ctx || el.width < 2 || el.height < 2) return false;
          const pts = [
            [Math.floor(el.width * 0.25), Math.floor(el.height * 0.25)],
            [Math.floor(el.width * 0.5), Math.floor(el.height * 0.5)],
            [Math.floor(el.width * 0.75), Math.floor(el.height * 0.75)],
          ];
          const samples = pts.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data).join(","));
          return new Set(samples).size > 1 || !samples.every((s) => s === "0,0,0,0");
        } catch {
          return false;
        }
      });

      return !opts.requireItems || visibleMedia || visibleText || visibleCanvasPixels;
    },
    { timeout: 45000, polling: 250 },
    { requireItems }
  );
}

async function waitForDesignPaint(opts = {}) {
  await waitForImages();
  await waitForCanvasProbe(opts);
  await waitForUiSettle();
}

async function shot(name, fullPage = false, opts = {}) {
  await waitForImages();
  if (!fullPage) await waitForCanvasProbe(opts);
  await waitForUiSettle();
  const target = path.join(outDir, name);
  await page.screenshot({ path: target, fullPage });
  log("wrote", path.relative(root, target));
}

async function seedBrandKit() {
  await inPage(`
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 360;
    const g = c.getContext("2d");
    g.fillStyle = "#f8fafc";
    g.fillRect(0, 0, 640, 360);
    g.fillStyle = "#0f766e";
    g.fillRect(70, 70, 180, 180);
    g.fillStyle = "#f97316";
    g.beginPath();
    g.arc(380, 180, 90, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#111827";
    g.font = "700 44px Inter, sans-serif";
    g.fillText("ACME", 70, 300);
    const dataUri = c.toDataURL("image/png");
    localStorage.setItem("youzign-next:brands", JSON.stringify({
      brands: [
        {
          id: "br_help_acme",
          name: "Acme Studio",
          colors: ["#0f766e", "#f97316", "#111827", "#f8fafc", "#2563eb", "#e11d48"],
          fonts: { heading: "Inter", body: "Roboto" },
          prompts: ["vibrant editorial campaign", "clean premium ecommerce lighting"],
          createdAt: 1783200000000
        },
        {
          id: "br_help_event",
          name: "Launch Event",
          colors: ["#7c3aed", "#facc15"],
          fonts: { heading: "Playfair Display", body: "Inter" },
          prompts: [],
          createdAt: 1783200001000
        }
      ],
      activeId: "br_help_acme"
    }));
    await new Promise((res, rej) => {
      const req = indexedDB.open("youzign-next", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("uploads")) db.createObjectStore("uploads", { keyPath: "id" });
      };
      req.onerror = () => rej(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("uploads", "readwrite");
        tx.objectStore("uploads").put({
          id: "up_help_logo",
          name: "acme-logo.png",
          type: "image/png",
          dataUri,
          width: 640,
          height: 360,
          createdAt: 1783200002000,
          brandId: "br_help_acme"
        });
        tx.oncomplete = () => {
          db.close();
          res();
        };
        tx.onerror = () => {
          db.close();
          rej(tx.error);
        };
      };
    });
    return true;
  `);
}

async function makeAiShot(hasFalKey) {
  await loadBlankDesign("AI generation help shot");
  await clickButtonText("Create");

  if (!hasFalKey) {
    warn("FAL_KEY is missing; ai-tools.png uses the static fallback gradient instead of a real fal.ai generation.");
    const target = path.join(outDir, "ai-tools-fallback.png");
    makePng(target, 1080, 1080);
    await page.evaluate((source) => {
      const st = window.__editor.getState();
      st.addPhoto({ source, width: 1080, height: 1080 });
      const uid = st.selectedUids[0];
      st.patchItemByUid(uid, { xpos: 540, ypos: 540, width: 1080, height: 1080 });
    }, `data:image/png;base64,${fs.readFileSync(target).toString("base64")}`);
    await shot("ai-tools.png");
    return;
  }

  await page.waitForSelector('[data-testid="generate-prompt"]', { timeout: 10000 });
  await page.click('[data-testid="generate-prompt"]');
  await page.keyboard.type("vibrant gradient poster background, purple and electric blue, minimal", { delay: 8 });
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    const square = buttons.find((b) => b.textContent.trim() === "Square");
    square?.click();
  });

  const beforeCount = await page.evaluate(() => window.__editor.getState().design.items.length);
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Generate");
    const action = buttons[buttons.length - 1];
    if (!action) throw new Error("Generate action button not found");
    action.click();
  });
  await waitForUiSettle();
  await page.waitForFunction(
    () => [...document.querySelectorAll("button[title='Add to canvas'] img")].some((img) => img.complete && img.naturalWidth > 0),
    { timeout: 60000, polling: 500 }
  );
  await page.click("button[title='Add to canvas']");
  await page.waitForFunction(
    (count) => window.__editor.getState().design.items.length > count,
    { timeout: 10000, polling: 250 },
    beforeCount
  );
  await page.evaluate(() => {
    const st = window.__editor.getState();
    const uid = st.selectedUids[0];
    const d = st.design;
    st.patchItemByUid(uid, { xpos: d.canvasWidth / 2, ypos: d.canvasHeight / 2, width: d.canvasWidth, height: d.canvasHeight });
  });
  await shot("ai-tools.png");
}

async function makeRemoveBgShot() {
  await loadBlankDesign("Remove background help shot");
  await page.evaluate(() => {
    const st = window.__editor.getState();
    st.setBgTransparent(true);
    st.addPhoto({ source: "/demo-portrait.jpg", width: 640, height: 640 });
    const uid = st.selectedUids[0];
    st.patchItemByUid(uid, { xpos: 540, ypos: 540, width: 800, height: 800 });
    st.select(uid);
  });
  await waitForDesignPaint();

  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /remove bg/i.test(b.textContent || ""));
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error("Remove bg button not found");

  await page.waitForFunction(
    () => {
      const st = window.__editor.getState();
      const img = st.design.items.find((it) => it.type === "image");
      return st.bgProcessingUids.length === 0 && !!img && String(img.source).startsWith("data:image/png");
    },
    { timeout: 120000, polling: 500 }
  );

  const alpha = await page.evaluate(async () => {
    const st = window.__editor.getState();
    const imgItem = st.design.items.find((it) => it.type === "image");
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = imgItem.source;
    });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const sample = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];
    return {
      tl: sample(2, 2),
      tr: sample(c.width - 3, 2),
      bl: sample(2, c.height - 3),
      br: sample(c.width - 3, c.height - 3),
      centre: sample(Math.floor(c.width / 2), Math.floor(c.height / 2)),
    };
  });
  log("remove-bg alpha", JSON.stringify(alpha));
  await shot("remove-bg.png");
}

async function makePagesShot() {
  await loadStarterDesign();
  await page.evaluate(() => {
    const st = window.__editor.getState();
    if (st.pages.length < 2) st.addPage();
    if (st.pages.length < 3) st.duplicatePage(0);
    st.setActivePage(0);
  });
  await page.waitForSelector('[data-testid="page-strip"]', { timeout: 10000 });
  await shot("pages.png");
}

async function makeBackgroundShot() {
  await loadStarterDesign();
  await page.evaluate(() => {
    const st = window.__editor.getState();
    st.select(null);
    st.applyGradientPreset(1);
    st.setCanvasBorderWidth(18);
    st.setCanvasBorderColor("#ffffff");
  });
  await shot("backgrounds.png");
}

async function verifyHelpImageMap() {
  const referenced = await page.evaluate(async () => {
    const mod = await import("/src/help-content.ts");
    return mod.sections.flatMap((section) =>
      section.blocks.filter((block) => block.type === "shot-ref").map((block) => block.file)
    );
  });
  const missingGenerator = referenced.filter((file) => !HELP_FILES.includes(file));
  const orphanGenerator = HELP_FILES.filter((file) => !referenced.includes(file));
  if (missingGenerator.length || orphanGenerator.length) {
    throw new Error(
      `help shot map mismatch: missing generators=${missingGenerator.join(",") || "none"}; orphans=${
        orphanGenerator.join(",") || "none"
      }`
    );
  }
}

try {
  fs.mkdirSync(outDir, { recursive: true });
  await page.setViewport({ width: 1440, height: 940, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
  await resetLocalDocs();
  const hasFalKey = await seedFalKey();
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
  await waitForApp();
  await verifyHelpImageMap();

  await shot("dashboard.png", true, { requireItems: false });

  await loadStarterDesign();
  await shot("editor-overview.png");

  await clickButtonText("Photos");
  await shot("panels-photos.png");

  await clickButtonText("Text");
  await shot("panels-text.png");

  await seedBrandKit();
  await clickButtonText("Brand");
  await page.waitForSelector('[data-brand-swatch="#0f766e"]', { timeout: 10000 });
  await shot("brand-kit.png");

  await makeAiShot(hasFalKey);
  await makeRemoveBgShot();
  await makeBackgroundShot();

  await page.click('[data-testid="resize-toggle"]');
  await page.waitForSelector('[data-testid="resize-popover"]', { timeout: 10000 });
  await shot("resize.png");

  await page.keyboard.press("Escape");
  await waitForUiSettle();
  await page.click('[data-testid="export-toggle"]');
  await page.waitForSelector('[data-testid="export-popover"]', { timeout: 10000 });
  await shot("export.png");

  await page.keyboard.press("Escape");
  await waitForUiSettle();
  await makePagesShot();

  await page.goto(`${ORIGIN}/#/backup`, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector("main", { timeout: 10000 });
  await shot("backup.png", true, { requireItems: false });

  log("complete");
} catch (err) {
  console.error("[help-shots] failed", err);
  if (logs.length) console.error(logs.slice(-40).join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
