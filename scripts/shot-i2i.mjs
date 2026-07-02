import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotsDir = resolve(__dirname, "../docs/shots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.env.SHOT_URL || "http://localhost:5206/";
const FAL_KEY = process.env.FAL_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!FAL_KEY) throw new Error("FAL_KEY missing in env");

// --- write two tiny solid PNGs to upload as reference images ---
function png(path, [r, g, b]) {
  const w = 64, h = 64;
  const crcTable = [...Array(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array(w).fill(Buffer.from([r, g, b])))]);
  const raw = Buffer.concat(Array(h).fill(row));
  const buf = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, buf);
}
const redPath = resolve(__dirname, "_i2i-red.png");
const bluePath = resolve(__dirname, "_i2i-blue.png");
png(redPath, [220, 40, 40]);
png(bluePath, [40, 120, 220]);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--force-device-scale-factor=2"],
});
const page = await browser.newPage();
page.on("console", (m) => console.log("[browser]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.setViewport({ width: 1200, height: 820, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });

// Seed the REAL fal key into localStorage so the Create panel is connected.
await page.evaluate((key) => {
  const keys = JSON.parse(localStorage.getItem("youzign-next:library-keys") || "{}");
  keys.fal = key;
  localStorage.setItem("youzign-next:library-keys", JSON.stringify(keys));
}, FAL_KEY);
await page.reload({ waitUntil: "networkidle2" });

async function clickTab(label) {
  const btns = await page.$$("nav button");
  for (const b of btns) {
    const t = await page.evaluate((el) => el.getAttribute("title"), b);
    if (t === label) return b.click();
  }
  throw new Error(`tab ${label} not found`);
}
const clickByText = async (text) => {
  const h = await page.evaluateHandle(
    (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t),
    text
  );
  const el = h.asElement();
  if (!el) throw new Error(`button "${text}" not found`);
  await el.click();
};

await clickTab("Create");
await sleep(400);
// Switch to Edit mode.
await clickByText("Edit");
await sleep(300);

// Upload the two reference images through the hidden file input.
// Upload one at a time (each change event ingests + appends a ref).
const countRefs = () =>
  page.evaluate(() => {
    const m = document.body.innerText.match(/(\d+)\/10/);
    return m ? Number(m[1]) : -1;
  });
// The Edit panel's input is the one accepting webp (Import accepts XML/JSON).
const editInput = async () => {
  const inputs = await page.$$('input[type="file"]');
  for (const el of inputs) {
    const accept = await page.evaluate((n) => n.getAttribute("accept") || "", el);
    if (accept.includes("webp")) return el;
  }
  throw new Error("edit file input not found");
};
await (await editInput()).uploadFile(redPath);
await sleep(1200);
console.log("after 1st upload, refs =", await countRefs());
await (await editInput()).uploadFile(bluePath);
await sleep(1500);
console.log("after 2nd upload, refs =", await countRefs());

await page.type("textarea", "combine into one scene on a beach");
await sleep(300);
await page.screenshot({ path: resolve(shotsDir, "i2i-panel.png") });
console.log("saved i2i-panel.png");

// Run the real edit.
const t0 = Date.now();
await clickByText("Generate edit");
// Wait for a result tile (title="Add to canvas") to appear.
await page.waitForSelector('button[title="Add to canvas"]', { timeout: 120000 });
const latency = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`edit latency: ${latency}s`);
await sleep(500);

// Insert the first result onto the canvas.
const result = await page.$('button[title="Add to canvas"]');
await result.click();
await sleep(1500);
await page.screenshot({ path: resolve(shotsDir, "i2i-result.png") });
console.log("saved i2i-result.png");

await browser.close();
console.log(`DONE latency=${latency}s`);
