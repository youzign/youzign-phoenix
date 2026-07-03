import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 5208;
const URL = `http://localhost:${PORT}/`;
let serverExit = null;

function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function waitFor(fn, label, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (serverExit) throw new Error(`Vite dev server exited early: ${JSON.stringify(serverExit)}\n${output}`);
    if (await fn()) return;
    await wait(150);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const server = spawn("pnpm", ["--filter", "@youzign/editor", "exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)], {
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
server.stdout.on("data", (d) => { output += d.toString(); });
server.stderr.on("data", (d) => { output += d.toString(); });
server.on("exit", (code, signal) => { serverExit = { code, signal }; });

let browser;
try {
  await waitFor(async () => output.includes(`:${PORT}`), "Vite dev server");
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", dumpio: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  await page.goto(URL, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => window.__editor?.getState);

  await page.evaluate(() => {
    const st = window.__editor.getState();
    st.setBgColor("#ff3333");
    st.addPage();
    window.__editor.getState().setBgColor("#22c55e");
    window.__editor.getState().addPage();
    window.__editor.getState().setBgColor("#3b82f6");
  });
  await page.waitForFunction(() => window.__editor.getState().pages.length === 3);

  let state = await page.evaluate(() => {
    const st = window.__editor.getState();
    return { activePage: st.activePage, count: st.pages.length, colors: st.pages.map((p) => p.design.bgColor) };
  });
  if (state.count !== 3 || state.activePage !== 2) throw new Error(`unexpected add state ${JSON.stringify(state)}`);

  await page.click('[data-testid="page-thumb-0"]');
  state = await page.evaluate(() => ({ activePage: window.__editor.getState().activePage }));
  if (state.activePage !== 0) throw new Error(`strip click failed ${JSON.stringify(state)}`);

  await page.keyboard.press("PageDown");
  state = await page.evaluate(() => ({ activePage: window.__editor.getState().activePage }));
  if (state.activePage !== 1) throw new Error(`PageDown failed ${JSON.stringify(state)}`);

  const from = await page.$('[data-testid="page-thumb-2"]');
  const to = await page.$('[data-testid="page-thumb-0"]');
  const fromBox = await from.boundingBox();
  const toBox = await to.boundingBox();
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 18 });
  await page.mouse.up();
  await wait(400);
  state = await page.evaluate(() => {
    const st = window.__editor.getState();
    return { activePage: st.activePage, colors: st.pages.map((p) => p.design.bgColor) };
  });
  if (state.colors[0] !== 3900150 || state.activePage !== 2) throw new Error(`drag reorder failed ${JSON.stringify(state)}`);

  await mkdir(resolve("docs/shots"), { recursive: true });
  const strip = await page.$('[data-testid="page-strip"]');
  await strip.screenshot({ path: resolve("docs/shots/multipage.png") });

  async function exportPdf(mode) {
    await page.evaluate(() => { window.__lastPdfExport = null; });
    await page.click('[data-testid="export-toggle"]');
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('[data-testid="export-popover"] button')];
      buttons.find((b) => b.textContent.trim() === "PDF")?.click();
    });
    await page.evaluate((label) => {
      const buttons = [...document.querySelectorAll('[data-testid="export-popover"] button')];
      buttons.find((b) => b.textContent.trim() === label)?.click();
    }, mode === "current" ? "Current" : "All");
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('[data-testid="export-popover"] button')];
      buttons[buttons.length - 1]?.click();
    });
    await page.waitForFunction(() => window.__lastPdfExport instanceof ArrayBuffer);
    return page.evaluate(() => {
      const bytes = new Uint8Array(window.__lastPdfExport);
      return { header: String.fromCharCode(...bytes.slice(0, 4)), size: bytes.byteLength };
    });
  }

  const single = await exportPdf("current");
  const multi = await exportPdf("all");
  if (single.header !== "%PDF" || multi.header !== "%PDF" || multi.size <= single.size) {
    throw new Error(`PDF assertion failed single=${JSON.stringify(single)} multi=${JSON.stringify(multi)}`);
  }

  console.log(`MULTIPAGE OK: strip/state/reorder passed; PDF single=${single.size} all=${multi.size}`);
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
