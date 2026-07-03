import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.resolve(root, "apps/editor/public/help");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5211/#/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[help-shots]", ...a);

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
      row[i] = Math.round(40 + (x / width) * 150);
      row[i + 1] = Math.round(85 + (y / height) * 130);
      row[i + 2] = Math.round(170 + ((x + y) / (width + height)) * 55);
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
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
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

async function shot(name, fullPage = false) {
  await page.evaluate(async () => {
    if (document.fonts) await document.fonts.ready;
  });
  await sleep(350);
  const target = path.join(outDir, name);
  await page.screenshot({ path: target, fullPage });
  log("wrote", path.relative(root, target));
}

async function clickButtonText(text) {
  await page.evaluate((label) => {
    const buttons = [...document.querySelectorAll("button")];
    const button = buttons.find((b) => b.textContent.trim() === label || b.getAttribute("title") === label);
    button?.click();
  }, text);
  await sleep(250);
}

async function openEditorWithImage() {
  const imagePath = path.join(os.tmpdir(), "youzign-help-shot-seed.png");
  makePng(imagePath, 960, 540);
  await page.click('[data-testid="new-design"]');
  await page.waitForSelector('[data-testid="new-design-modal"]');
  const input = await page.$('[data-testid="image-file-input"]');
  await input.uploadFile(imagePath);
  await page.waitForFunction(() => location.hash.startsWith("#/d/"), { timeout: 10000 });
  await page.waitForFunction(() => window.__editor?.getState()?.design?.items?.length === 1, { timeout: 10000 });
  await sleep(700);
  await page.mouse.click(720, 455);
  await sleep(300);
}

try {
  fs.mkdirSync(outDir, { recursive: true });
  await page.setViewport({ width: 1440, height: 940, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
  await inPage(
    `await new Promise((res, rej) => {
       const del = indexedDB.deleteDatabase("youzign-docs");
       del.onsuccess = del.onblocked = () => res();
       del.onerror = () => rej(del.error);
     });
     localStorage.removeItem("youzign-docs:migrated-localstorage-v1");
     return true;`
  );

  await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector('[data-testid="new-design"]');
  await shot("dashboard.png", true);

  await openEditorWithImage();
  await shot("editor-overview.png");

  await clickButtonText("Photos");
  await shot("panels-photos.png");

  await clickButtonText("Text");
  await shot("panels-text.png");

  await clickButtonText("Create");
  await shot("ai-tools.png");

  await page.keyboard.press("Escape");
  await sleep(250);
  await shot("backgrounds.png");

  await page.click('[data-testid="resize-toggle"]');
  await page.waitForSelector('[data-testid="resize-popover"]');
  await shot("resize.png");

  await page.keyboard.press("Escape");
  await sleep(150);
  await page.click('[data-testid="export-toggle"]');
  await page.waitForSelector('[data-testid="export-popover"]');
  await shot("export.png");

  await page.keyboard.press("Escape");
  await sleep(150);
  await shot("pages.png");

  await page.goto("http://localhost:5211/#/backup", { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector("main");
  await shot("backup.png", true);

  log("complete");
} catch (err) {
  console.error("[help-shots] failed", err);
  if (logs.length) console.error(logs.slice(-20).join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
