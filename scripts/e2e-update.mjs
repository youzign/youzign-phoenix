import { execFileSync, spawn } from "node:child_process";
import http from "node:http";
import puppeteer from "puppeteer-core";

const APP_PORT = 5211;
const UPDATE_PORT = 5212;
const UPDATE_URL = `http://127.0.0.1:${UPDATE_PORT}/version.json`;
const DOWNLOAD_URL = "https://example.test/youzign-9.9.9";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

execFileSync("pnpm", ["--filter", "./packages/*", "-r", "build"], { stdio: "inherit" });

const endpoint = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  if (req.url !== "/version.json") {
    res.writeHead(404).end(JSON.stringify({ error: "not found" }));
    return;
  }
  res.end(JSON.stringify({ version: "9.9.9", url: DOWNLOAD_URL, notes: "Mock release endpoint" }));
});

await new Promise((resolve, reject) => endpoint.listen(UPDATE_PORT, "127.0.0.1", resolve).once("error", reject));
const vite = spawn(
  "pnpm",
  ["--filter", "@youzign/editor", "exec", "vite", "--host", "127.0.0.1", "--port", String(APP_PORT), "--strictPort"],
  { env: { ...process.env, VITE_VERSION_URL: UPDATE_URL }, stdio: ["ignore", "pipe", "pipe"] }
);

let viteOutput = "";
vite.stdout.on("data", (chunk) => (viteOutput += chunk));
vite.stderr.on("data", (chunk) => (viteOutput += chunk));

async function waitForApp() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${APP_PORT}/`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not become ready:\n${viteOutput}`);
}

let browser;
try {
  await waitForApp();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__updateOpenedUrl = null;
    window.open = (url) => {
      window.__updateOpenedUrl = String(url);
      return null;
    };
  });
  await page.goto(`http://127.0.0.1:${APP_PORT}/#/`, { waitUntil: "networkidle2" });
  await page.waitForSelector('[data-testid="update-dot"]');
  const label = await page.$eval('[data-testid="update-logo"]', (node) => node.getAttribute("aria-label"));
  if (label !== "Youzign update available") throw new Error(`unexpected update label: ${label}`);
  await page.click('[data-testid="update-logo"]');
  const panel = await page.$eval('[data-testid="update-panel"]', (node) => node.textContent);
  if (!panel.includes("9.9.9") || !panel.includes("Mock release endpoint")) {
    throw new Error(`mock release missing from update panel: ${panel}`);
  }
  await page.click('[data-testid="download-update"]');
  await page.waitForFunction((url) => window.__updateOpenedUrl === url, {}, DOWNLOAD_URL);
  console.log("Update E2E OK: mock endpoint -> blue dot -> release panel -> download URL.");
} finally {
  await browser?.close();
  vite.kill("SIGTERM");
  await new Promise((resolve) => endpoint.close(resolve));
}
