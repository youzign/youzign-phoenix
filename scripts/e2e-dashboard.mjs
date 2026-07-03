import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5210/#/";
const SHOT = "docs/shots/dashboard.png";

const log = (...a) => console.log("[e2e-dashboard]", ...a);

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
      row[i] = Math.round((x / width) * 255);
      row[i + 1] = Math.round((y / height) * 255);
      row[i + 2] = 180;
      row[i + 3] = 255;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
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

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

const page = await b.newPage();
await page.setViewport({ width: 1440, height: 1050 });

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

async function docCount() {
  return await inPage(
    `const req = indexedDB.open("youzign-docs", 1);
     const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); req.onupgradeneeded = () => req.result.createObjectStore("documents", { keyPath: "id" }); });
     const tx = db.transaction("documents", "readonly");
     const get = tx.objectStore("documents").getAll();
     const rows = await new Promise((res, rej) => { get.onsuccess = () => res(get.result); get.onerror = () => rej(get.error); });
     db.close();
     return rows.length;`
  );
}

try {
  await page.goto(URL, { waitUntil: "networkidle2" });
  await inPage(
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
  log("dashboard ready");

  await page.click('[data-testid="new-design"]');
  await page.waitForSelector('[data-testid="new-design-modal"]');
  // YouTube presets live under the Video category chip.
  await page.evaluate(() => {
    const chips = [...document.querySelectorAll('[data-testid="new-design-modal"] button')];
    const video = chips.find((b) => b.textContent.trim() === "Video");
    if (video) video.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-testid="new-design-modal"] [data-preset-id="yt-thumbnail"]');
  await page.waitForFunction(() => location.hash.startsWith("#/d/"), { timeout: 10000 });
  await page.waitForFunction(() => window.__editor?.getState()?.documentId, { timeout: 10000 });
  await page.waitForFunction(() => window.__editor.getState().design.canvasWidth === 1280, { timeout: 10000 });
  await page.waitForFunction(async () => {
    const req = indexedDB.open("youzign-docs", 1);
    const db = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const tx = db.transaction("documents", "readonly");
    const get = tx.objectStore("documents").getAll();
    const rows = await new Promise((res, rej) => {
      get.onsuccess = () => res(get.result);
      get.onerror = () => rej(get.error);
    });
    db.close();
    return rows.length === 1 && rows[0].width === 1280 && rows[0].height === 720;
  });
  log("preset document created");

  await page.evaluate(() => (location.hash = "#/"));
  await page.waitForSelector('[data-testid="design-card"]');
  if ((await docCount()) !== 1) throw new Error("expected one document after preset create");

  const card = await page.$('[data-testid="design-card"]');
  await card.hover();
  await page.click('[data-testid="duplicate-design"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="design-card"]').length >= 2);
  if ((await docCount()) !== 2) throw new Error("duplicate did not create a second document");
  log("duplicate created");

  fs.mkdirSync(path.dirname(SHOT), { recursive: true });
  await page.screenshot({ path: SHOT, fullPage: true });
  log("screenshot wrote", SHOT);

  const firstName = (await page.$$('[data-testid="design-name"]'))[0];
  await firstName.click({ clickCount: 2 });
  log("dblclicked name");
  try {
    await page.waitForSelector('[data-testid="rename-input"]', { timeout: 8000 });
  } catch (e) {
    const st = await page.evaluate(() => ({ hash: location.hash, names: [...document.querySelectorAll('[data-testid=\"design-name\"]')].map((n) => n.textContent), input: !!document.querySelector('[data-testid=\"rename-input\"]') }));
    console.error("rename-input missing; state:", JSON.stringify(st));
    throw e;
  }
  log("rename input open");
  await page.evaluate(() => {
    const i = document.querySelector('[data-testid="rename-input"]');
    i.setSelectionRange(0, i.value.length);
  });
  await page.keyboard.type("Renamed dashboard doc");
  await page.keyboard.press("Enter");
  log("typed rename");
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="design-name"]')].some((n) => n.textContent.includes("Renamed dashboard doc")), { timeout: 10000 });
  log("renamed document");

  const cards = await page.$$('[data-testid="design-card"]');
  await cards[1].hover();
  const deleteButtons = await page.$$('[data-testid="delete-design"]');
  await deleteButtons[1].click();
  await deleteButtons[1].click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="design-card"]').length === 1);
  if ((await docCount()) !== 1) throw new Error("delete did not remove one document");
  log("deleted duplicate");

  const imagePath = path.join(os.tmpdir(), "youzign-dashboard-e2e.png");
  makePng(imagePath, 640, 360);
  await page.click('[data-testid="new-design"]');
  await page.waitForSelector('[data-testid="new-design-modal"]');
  // YouTube presets live under the Video category chip.
  await page.evaluate(() => {
    const chips = [...document.querySelectorAll('[data-testid="new-design-modal"] button')];
    const video = chips.find((b) => b.textContent.trim() === "Video");
    if (video) video.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  const input = await page.$('[data-testid="image-file-input"]');
  await input.uploadFile(imagePath);
  await page.waitForFunction(() => location.hash.startsWith("#/d/"), { timeout: 10000 });
  await page.waitForFunction(() => window.__editor?.getState()?.design?.items?.length === 1, { timeout: 10000 });
  const imageDoc = await page.evaluate(() => {
    const st = window.__editor.getState();
    const item = st.design.items[0];
    return {
      w: st.design.canvasWidth,
      h: st.design.canvasHeight,
      itemType: item.type,
      itemW: item.width,
      itemH: item.height,
      x: item.xpos,
      y: item.ypos,
    };
  });
  if (
    imageDoc.w !== 640 ||
    imageDoc.h !== 360 ||
    imageDoc.itemType !== "image" ||
    imageDoc.itemW !== 640 ||
    imageDoc.itemH !== 360 ||
    imageDoc.x !== 320 ||
    imageDoc.y !== 180
  ) {
    throw new Error("start-from-image assertion failed: " + JSON.stringify(imageDoc));
  }
  log("start-from-image created exact-size canvas", imageDoc);

  await b.close();
  console.log("DASHBOARD E2E OK");
} catch (err) {
  await b.close();
  console.error("DASHBOARD E2E FAILED", err);
  process.exit(1);
}
