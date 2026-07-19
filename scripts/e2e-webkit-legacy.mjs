// WebKit (Playwright) pre-release verification for the legacy-import feature
// and bug-report form. Tauri ships WKWebView, so Chrome-only QA is not
// sufficient — this exercises the same flows in real WebKit.
//
// Run (playwright installed in a scratch dir OUTSIDE the repo, not a repo dep):
//   NODE_PATH=<scratch-dir>/node_modules node scripts/e2e-webkit-legacy.mjs
// Requires: pnpm --filter @youzign/editor dev  running on http://localhost:5191/
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// playwright is intentionally NOT a repo dependency (house rule: don't add
// deps to the repo for a one-off QA script). It's installed in a scratch dir
// outside the repo; the caller sets NODE_PATH to that scratch node_modules
// before invoking this script. See run instructions at the top of this file.
const require = createRequire(import.meta.url);
const { webkit } = require("playwright");

const URL = "http://localhost:5191/#/";
const SHOT_DIR = "/Users/dezygn/Projects/dev/youzign-next/docs/planning/legacy-claim-shots/webkit";
fs.mkdirSync(SHOT_DIR, { recursive: true });
const shot = (n) => path.join(SHOT_DIR, n);

const log = (...a) => console.log("[e2e-webkit]", ...a);
const results = { items: {}, consoleErrors: [], consoleErrorsIgnored: [] };

// Known noise, not WebKit-specific breakage: html2canvas (used for dashboard
// thumbnail generation) tries to inline the Google Fonts stylesheet for
// export/thumbnail rendering and gets a same-origin-policy SecurityError —
// happens in every browser, not a WebKit regression.
const IGNORE_CONSOLE_RE =
  /fonts\.googleapis\.com|fonts\.gstatic\.com.*cross-origin|CORS.*fonts\.g|cross-origin stylesheet|inlining remote css file/i;

function classifyConsole(text) {
  if (IGNORE_CONSOLE_RE.test(text)) return "ignored";
  return "real";
}

async function resetDb(page) {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await new Promise((res) => {
      const d = indexedDB.deleteDatabase("youzign-docs");
      d.onsuccess = d.onblocked = () => res();
      d.onerror = () => res();
    });
    localStorage.removeItem("youzign-docs:migrated-localstorage-v1");
  });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="new-design"]');
}

async function clickByText(page, selector, re) {
  const handle = await page.evaluateHandle(
    ({ sel, pattern }) => {
      const re = new RegExp(pattern, "i");
      const els = [...document.querySelectorAll(sel)];
      return els.find((el) => re.test((el.textContent || "").trim())) || null;
    },
    { sel: selector, pattern: re.source }
  );
  const el = handle.asElement();
  if (!el) throw new Error(`clickByText: no match for ${re} in ${selector}`);
  await el.click();
}

async function evalReturn(page, fnBody, arg) {
  return page.evaluate(
    ({ body, a }) => {
      // eslint-disable-next-line no-new-func
      const fn = new Function("arg", body);
      return fn(a);
    },
    { body: fnBody, a: arg }
  );
}

// ---------- Item 1: dashboard + existing flows sanity ----------
async function testDashboardSanity(page) {
  const name = "1-dashboard-sanity";
  try {
    await resetDb(page);
    await page.screenshot({ path: shot("01-dashboard.png"), fullPage: true });

    await page.click('[data-testid="new-design"]');
    await page.waitForSelector('[data-testid="new-design-modal"]');
    await page.screenshot({ path: shot("02-new-design-modal.png") });

    // Create a blank design via the first preset in the grid.
    await page.click('[data-testid="preset-grid"] button');
    await page.waitForFunction(() => location.hash.startsWith("#/d/"), { timeout: 10000 });
    await page.waitForFunction(() => !!window.__editor?.getState?.()?.documentId, { timeout: 10000 });
    log("blank design created");

    // Add a text item and type into it via the Text panel's primary action.
    await clickByText(page, "button", /^text$/);
    await page.waitForSelector("text=Add a text box").catch(() => {});
    const before = await page.evaluate(() => window.__editor.getState().design.items.length);
    await clickByText(page, "button", /add a text box/i);
    await page.waitForFunction(
      (n) => window.__editor.getState().design.items.length > n,
      before,
      { timeout: 10000 }
    );
    const uid = await page.evaluate(() => window.__editor.getState().selectedUids[0]);
    // Exercise real WebKit keyboard input by driving inline text edit via
    // double-click on the canvas hit-area (centered under the new text box),
    // then typing, matching the store's inline-commit path.
    const canvasBox = await page.locator('[data-testid="editor-workspace"] .yz-canvas').first().boundingBox();
    if (canvasBox) {
      await page.mouse.dblclick(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
      await page.waitForTimeout(200);
      const editing = await page.evaluate(() => !!document.querySelector('[data-inline-text-editor="true"]'));
      if (editing) {
        await page.keyboard.press("Meta+A").catch(() => {});
        await page.keyboard.type("Hello WebKit", { delay: 15 });
        // Click away inside the canvas (near its bottom-right corner, away
        // from the centered text box) to commit — NOT (20,20), which lands
        // on the top-left app-logo/home link and navigates off the editor.
        await page.mouse.click(canvasBox.x + canvasBox.width - 15, canvasBox.y + canvasBox.height - 15);
        await page.waitForTimeout(200);
      }
    }
    const content = await page.evaluate(
      (u) => window.__editor.getState().design.items.find((it) => it._uid === u)?.content,
      uid
    );
    await page.screenshot({ path: shot("03-text-item.png") });
    log("text item content after WebKit typing:", JSON.stringify(content));

    // Back to dashboard.
    await page.evaluate(() => (location.hash = "#/"));
    await page.waitForSelector('[data-testid="design-card"]', { timeout: 10000 });
    await page.screenshot({ path: shot("04-back-to-dashboard.png"), fullPage: true });

    results.items[name] = { pass: true, textContent: content };
  } catch (err) {
    results.items[name] = { pass: false, error: String(err?.stack || err) };
    log("FAILED", name, err);
  }
}

// ---------- Item 2: legacy import end-to-end (darkknight) ----------
async function testLegacyImportDarkknight(page) {
  const name = "2-legacy-import-darkknight";
  const identifier = "marketing";
  const title = "darkknight";
  try {
    await resetDb(page);
    await clickByText(page, "button,a", /^backup$/);
    await page.waitForTimeout(300);
    await clickByText(page, "button", /find my designs/i);
    await page.waitForSelector("#legacy-identifier");
    await page.fill("#legacy-identifier", identifier);
    await page.evaluate(() => {
      const f = document.querySelector('[data-testid="legacy-import-modal"] form');
      f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });
    await page.waitForFunction(
      () => /Welcome back,/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent || ""),
      { timeout: 40000 }
    );
    await page.waitForTimeout(2500); // let thumbnails paint

    const thumbCheck = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('[data-testid="legacy-import-modal"] img')];
      return {
        total: imgs.length,
        withNaturalWidth: imgs.filter((i) => i.naturalWidth > 0).length,
      };
    });
    log("grid thumbnails:", JSON.stringify(thumbCheck));
    await page.screenshot({ path: shot("05-legacy-grid-marketing.png"), fullPage: true });

    // Select exactly "darkknight" by EXACT title equality.
    await page.evaluate(() => {
      const sa = document.querySelectorAll('[data-testid="legacy-import-modal"] input[type=checkbox]')[0];
      if (sa?.checked) sa.click();
    });
    await page.waitForTimeout(150);
    const checked = await page.evaluate((wantedTitle) => {
      const cards = [...document.querySelectorAll('[data-testid="legacy-import-modal"] label')].filter(
        (l) => l.querySelector('input[type="checkbox"]') && l.querySelector("img,svg")
      );
      const card = cards.find((l) => {
        const titleEl = l.querySelector("[data-design-title]") || l;
        const text = (titleEl.getAttribute?.("data-design-title") || "").trim();
        return text === wantedTitle;
      });
      // Fall back: match against a dedicated title node's exact textContent if
      // no data-design-title attribute exists (avoid substring matches).
      let target = card;
      if (!target) {
        target = cards.find((l) => {
          const nodes = [...l.querySelectorAll("*")].filter((n) => n.children.length === 0);
          return nodes.some((n) => (n.textContent || "").trim() === wantedTitle);
        });
      }
      const cb = target?.querySelector('input[type="checkbox"]');
      if (cb && !cb.checked) {
        cb.click();
        return true;
      }
      return false;
    }, title);
    log("checked darkknight card:", checked);

    await clickByText(page, '[data-testid="legacy-import-modal"] footer button', /^import \d+ designs$/);
    await page.waitForFunction(
      () => /imported, .* failed/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent || ""),
      { timeout: 180000 }
    );
    const summaryText = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[data-testid="legacy-import-modal"] div')].find((d) =>
        /\d+\s+imported,\s+\d+\s+failed/i.test(d.textContent || "")
      );
      return el?.textContent || "";
    });
    log("import summary:", summaryText);
    await page.screenshot({ path: shot("06-legacy-import-summary.png") });

    await clickByText(page, '[data-testid="legacy-import-modal"] button', /^done$/);
    await page.waitForFunction(() => !document.querySelector('[data-testid="legacy-import-modal"]'), { timeout: 5000 });

    await clickByText(page, "button,a", /^designs$/);
    await page.waitForSelector('[data-testid="design-card"]', { timeout: 15000 });
    await page.waitForTimeout(500);

    // Open EXACTLY "darkknight" (exact title equality, not substring).
    const opened = await page.evaluate((wantedTitle) => {
      const cards = [...document.querySelectorAll('[data-testid="design-card"]')];
      const card = cards.find((c) => {
        const nameEl = c.querySelector('[data-testid="design-name"]');
        return (nameEl?.textContent || "").trim() === wantedTitle;
      });
      if (!card) return false;
      card.click();
      return true;
    }, title);
    log("opened darkknight card:", opened);
    await page.waitForFunction(() => location.hash.startsWith("#/d/"), { timeout: 10000 });
    await page.waitForFunction(() => !!window.__editor?.getState?.()?.documentId, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await page.waitForFunction(
      () =>
        document.fonts && document.fonts.status !== undefined
          ? document.fonts.ready.then(() => true)
          : true,
      { timeout: 15000 }
    ).catch(() => {});
    await page.evaluate(() => document.fonts.ready);

    const fontLoaded = await page.evaluate(() => {
      try {
        return document.fonts.check('16px "Fredericka the Great"');
      } catch (e) {
        return false;
      }
    });
    log("Fredericka the Great font loaded:", fontLoaded);

    const canvasState = await page.evaluate(() => {
      const s = window.__editor?.getState?.();
      if (!s) return null;
      const items = s.design?.items || [];
      const texts = items.filter((it) => it.type === "text").map((it) => it.content);
      // The internal item model doesn't carry an isBackground flag post-parse;
      // detect "full-bleed" by the image covering ~the whole canvas instead.
      const cw = s.design?.canvasWidth || 0;
      const ch = s.design?.canvasHeight || 0;
      const hasFullBleedImage = items.some(
        (it) => it.type === "image" && it.width >= cw * 0.9 && it.height >= ch * 0.9
      );
      return { itemsCount: items.length, texts, hasFullBleedImage };
    });
    log("canvas state:", JSON.stringify(canvasState));

    const stage = page.locator('[data-testid="editor-workspace"] .yz-canvas').first();
    await stage.screenshot({ path: shot("07-darkknight-canvas.png") });

    const titleTextOk = canvasState?.texts?.some((t) => /dark knight/i.test(t));
    const johnDoeOk = canvasState?.texts?.some((t) => /john doe/i.test(t));

    results.items[name] = {
      pass: !!opened && !!canvasState?.hasFullBleedImage && !!titleTextOk && !!johnDoeOk && fontLoaded,
      thumbCheck,
      summaryText,
      opened,
      canvasState,
      fontLoaded,
    };
  } catch (err) {
    results.items[name] = { pass: false, error: String(err?.stack || err) };
    log("FAILED", name, err);
  }
}

// ---------- Item 3: clipart recolor (OMS flyer back) ----------
async function testClipartRecolor(page) {
  const name = "3-clipart-recolor";
  const identifier = "7YgkgPFJ";
  const title = "OMS flyer back";
  try {
    await resetDb(page);
    await clickByText(page, "button,a", /^backup$/);
    await page.waitForTimeout(300);
    await clickByText(page, "button", /find my designs/i);
    await page.waitForSelector("#legacy-identifier");
    await page.fill("#legacy-identifier", identifier);
    await page.evaluate(() => {
      const f = document.querySelector('[data-testid="legacy-import-modal"] form');
      f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });
    await page.waitForFunction(
      () => /Welcome back,/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent || ""),
      { timeout: 40000 }
    );
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      const sa = document.querySelectorAll('[data-testid="legacy-import-modal"] input[type=checkbox]')[0];
      if (sa?.checked) sa.click();
    });
    await page.waitForTimeout(150);
    const checked = await page.evaluate((wantedTitle) => {
      const cards = [...document.querySelectorAll('[data-testid="legacy-import-modal"] label')].filter(
        (l) => l.querySelector('input[type="checkbox"]') && l.querySelector("img,svg")
      );
      const card = cards.find((l) => {
        const nodes = [...l.querySelectorAll("*")].filter((n) => n.children.length === 0);
        return nodes.some((n) => (n.textContent || "").trim() === wantedTitle);
      });
      const cb = card?.querySelector('input[type="checkbox"]');
      if (cb && !cb.checked) {
        cb.click();
        return true;
      }
      return false;
    }, title);
    log("checked OMS flyer back card:", checked);

    await clickByText(page, '[data-testid="legacy-import-modal"] footer button', /^import \d+ designs$/);
    await page.waitForFunction(
      () => /imported, .* failed/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent || ""),
      { timeout: 180000 }
    );
    await clickByText(page, '[data-testid="legacy-import-modal"] button', /^done$/);
    await page.waitForFunction(() => !document.querySelector('[data-testid="legacy-import-modal"]'), { timeout: 5000 });

    await clickByText(page, "button,a", /^designs$/);
    await page.waitForSelector('[data-testid="design-card"]', { timeout: 15000 });
    await page.waitForTimeout(500);

    const opened = await page.evaluate((wantedTitle) => {
      const cards = [...document.querySelectorAll('[data-testid="design-card"]')];
      const card = cards.find((c) => {
        const nameEl = c.querySelector('[data-testid="design-name"]');
        return (nameEl?.textContent || "").trim() === wantedTitle;
      });
      if (!card) return false;
      card.click();
      return true;
    }, title);
    log("opened OMS flyer back card:", opened);
    await page.waitForFunction(() => location.hash.startsWith("#/d/"), { timeout: 10000 });
    await page.waitForFunction(() => !!window.__editor?.getState?.()?.documentId, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(4000);

    const svgInfo = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="editor-workspace"] .yz-canvas');
      const svgs = canvas ? [...canvas.querySelectorAll("svg")] : [];
      return { svgCount: svgs.length };
    });
    log("inline svg count:", svgInfo.svgCount);

    // Pixel-sample each svg's bounding box drawn into an offscreen canvas to
    // check dominant hue (blue vs. gray = the bug this guards against).
    const hueSamples = await page.evaluate(async () => {
      const canvasEl = document.querySelector('[data-testid="editor-workspace"] .yz-canvas');
      const svgs = canvasEl ? [...canvasEl.querySelectorAll("svg")] : [];
      const results = [];
      for (const svg of svgs.slice(0, 8)) {
        const rect = svg.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) continue;
        const xml = new XMLSerializer().serializeToString(svg);
        const svgUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
        const img = new Image();
        const loaded = await new Promise((resolve) => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = svgUrl;
        });
        if (!loaded) continue;
        const c = document.createElement("canvas");
        c.width = Math.max(2, Math.round(rect.width));
        c.height = Math.max(2, Math.round(rect.height));
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const samplePts = [
          [Math.floor(c.width * 0.3), Math.floor(c.height * 0.3)],
          [Math.floor(c.width * 0.5), Math.floor(c.height * 0.5)],
          [Math.floor(c.width * 0.7), Math.floor(c.height * 0.7)],
          [Math.floor(c.width * 0.3), Math.floor(c.height * 0.7)],
          [Math.floor(c.width * 0.7), Math.floor(c.height * 0.3)],
        ];
        const pixels = [];
        for (const [x, y] of samplePts) {
          try {
            const d = ctx.getImageData(x, y, 1, 1).data;
            if (d[3] > 40) pixels.push([d[0], d[1], d[2]]);
          } catch {
            // ignore
          }
        }
        results.push({ rect: { w: rect.width, h: rect.height }, pixels });
      }
      return results;
    });

    function rgbToHsl(r, g, b) {
      r /= 255;
      g /= 255;
      b /= 255;
      const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
      let h = 0,
        s = 0;
      const l = (max + min) / 2;
      const d = max - min;
      if (d !== 0) {
        s = d / (1 - Math.abs(2 * l - 1));
        switch (max) {
          case r:
            h = ((g - b) / d) % 6;
            break;
          case g:
            h = (b - r) / d + 2;
            break;
          case b:
            h = (r - g) / d + 4;
            break;
        }
        h *= 60;
        if (h < 0) h += 360;
      }
      return { h, s, l };
    }

    let blueLikeCount = 0;
    let grayShapeCount = 0; // mid-gray, not near-white bbox padding, not blue
    let totalSampled = 0;
    let totalShapePixels = 0; // excludes near-white bbox padding
    const hueDump = [];
    for (const shape of hueSamples) {
      for (const [r, g, b] of shape.pixels) {
        totalSampled++;
        const { h, s } = rgbToHsl(r, g, b);
        hueDump.push({ r, g, b, h: Math.round(h), s: Math.round(s * 100) });
        const nearWhite = r > 240 && g > 240 && b > 240; // bbox padding, not a shape fill
        if (nearWhite) continue;
        totalShapePixels++;
        // Blue-ish: hue 180-260deg with meaningful saturation (grays have s~0).
        if (s > 0.15 && h >= 180 && h <= 260) blueLikeCount++;
        else if (s < 0.1) grayShapeCount++; // the exact bug this guards against
      }
    }
    log("hue samples:", JSON.stringify(hueDump));
    log(`blue-like pixels: ${blueLikeCount}/${totalShapePixels} (of ${totalSampled} total incl. bbox padding); flat-gray shape pixels: ${grayShapeCount}`);

    const stage = page.locator('[data-testid="editor-workspace"] .yz-canvas').first();
    await stage.screenshot({ path: shot("08-clipart-recolor-canvas.png") });

    results.items[name] = {
      pass:
        !!opened &&
        svgInfo.svgCount > 0 &&
        totalShapePixels > 0 &&
        blueLikeCount / Math.max(1, totalShapePixels) >= 0.5,
      opened,
      svgInfo,
      totalSampled,
      totalShapePixels,
      blueLikeCount,
      grayShapeCount,
      hueDump,
    };
  } catch (err) {
    results.items[name] = { pass: false, error: String(err?.stack || err) };
    log("FAILED", name, err);
  }
}

// ---------- Item 4: self-hosted legacy font (ISSPWhichTypeofAccount) ----------
async function testLegacyFont(page, consoleTracker) {
  const name = "4-legacy-font";
  const identifier = "imgllc";
  const title = "ISSPWhichTypeofAccount";
  try {
    consoleTracker.start(name);
    await resetDb(page);
    await clickByText(page, "button,a", /^backup$/);
    await page.waitForTimeout(300);
    await clickByText(page, "button", /find my designs/i);
    await page.waitForSelector("#legacy-identifier");
    await page.fill("#legacy-identifier", identifier);
    await page.evaluate(() => {
      const f = document.querySelector('[data-testid="legacy-import-modal"] form');
      f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });
    await page.waitForFunction(
      () => /Welcome back,/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent || ""),
      { timeout: 40000 }
    );
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      const sa = document.querySelectorAll('[data-testid="legacy-import-modal"] input[type=checkbox]')[0];
      if (sa?.checked) sa.click();
    });
    await page.waitForTimeout(150);
    const checked = await page.evaluate((wantedTitle) => {
      const cards = [...document.querySelectorAll('[data-testid="legacy-import-modal"] label')].filter(
        (l) => l.querySelector('input[type="checkbox"]') && l.querySelector("img,svg")
      );
      const card = cards.find((l) => {
        const nodes = [...l.querySelectorAll("*")].filter((n) => n.children.length === 0);
        return nodes.some((n) => (n.textContent || "").trim() === wantedTitle);
      });
      const cb = card?.querySelector('input[type="checkbox"]');
      if (cb && !cb.checked) {
        cb.click();
        return true;
      }
      return false;
    }, title);
    log("checked ISSPWhichTypeofAccount card:", checked);

    await clickByText(page, '[data-testid="legacy-import-modal"] footer button', /^import \d+ designs$/);
    await page.waitForFunction(
      () => /imported, .* failed/i.test(document.querySelector('[data-testid="legacy-import-modal"]')?.textContent || ""),
      { timeout: 180000 }
    );
    await clickByText(page, '[data-testid="legacy-import-modal"] button', /^done$/);
    await page.waitForFunction(() => !document.querySelector('[data-testid="legacy-import-modal"]'), { timeout: 5000 });

    await clickByText(page, "button,a", /^designs$/);
    await page.waitForSelector('[data-testid="design-card"]', { timeout: 15000 });
    await page.waitForTimeout(500);

    const opened = await page.evaluate((wantedTitle) => {
      const cards = [...document.querySelectorAll('[data-testid="design-card"]')];
      const card = cards.find((c) => {
        const nameEl = c.querySelector('[data-testid="design-name"]');
        return (nameEl?.textContent || "").trim() === wantedTitle;
      });
      if (!card) return false;
      card.click();
      return true;
    }, title);
    log("opened ISSPWhichTypeofAccount card:", opened);
    await page.waitForFunction(() => location.hash.startsWith("#/d/"), { timeout: 10000 });
    await page.waitForFunction(() => !!window.__editor?.getState?.()?.documentId, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await page.evaluate(() => document.fonts.ready);

    const stage = page.locator('[data-testid="editor-workspace"] .yz-canvas').first();
    await stage.screenshot({ path: shot("09-legacy-font-canvas.png") });

    const { errors } = consoleTracker.stop();
    const fontErrors = errors.filter((e) => /legacy-fonts/i.test(e) && /404|not found|failed/i.test(e));
    log("legacy-fonts console errors:", JSON.stringify(fontErrors));

    results.items[name] = {
      pass: !!opened && fontErrors.length === 0,
      opened,
      fontErrors,
      allConsoleErrorsDuringTest: errors,
    };
  } catch (err) {
    consoleTracker.stop();
    results.items[name] = { pass: false, error: String(err?.stack || err) };
    log("FAILED", name, err);
  }
}

// ---------- Item 5: bug report form (intercepted network) ----------
async function testBugReportForm(page) {
  const name = "5-bug-report-form";
  try {
    await resetDb(page);
    await page.evaluate(() => (location.hash = "#/help"));
    await page.waitForTimeout(500);
    await clickByText(page, "button", /report a bug/i);
    await page.waitForSelector('[data-testid="bug-report-modal"]', { timeout: 10000 });

    let intercepted = null;
    await page.route("https://www.youzign.com/api/bugreport", async (route) => {
      const req = route.request();
      try {
        intercepted = { method: req.method(), body: JSON.parse(req.postData() || "{}") };
      } catch (e) {
        intercepted = { method: req.method(), bodyParseError: String(e) };
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.selectOption("#bug-category", "import");
    await page.fill("#bug-description", "WebKit e2e verification run — testing bug report submission.");
    await page.fill("#bug-email", "webkit-e2e@example.com");
    await page.screenshot({ path: shot("10-bug-report-filled.png") });

    await clickByText(page, '[data-testid="bug-report-modal"] button[type="submit"]', /send report/i);
    await page.waitForFunction(() => /thanks — we got it/i.test(document.querySelector('[data-testid="bug-report-modal"]')?.textContent || ""), { timeout: 15000 });
    await page.screenshot({ path: shot("11-bug-report-sent.png") });

    log("intercepted bug report payload:", JSON.stringify(intercepted));

    const body = intercepted?.body || {};
    const shapeOk =
      body.category === "import" &&
      typeof body.description === "string" &&
      body.description.length > 0 &&
      body.email === "webkit-e2e@example.com" &&
      typeof body.appVersion === "string" &&
      body.appVersion.length > 0 &&
      typeof body.platform === "string" &&
      body.platform.length > 0;

    results.items[name] = {
      pass: intercepted?.method === "POST" && shapeOk,
      intercepted,
    };
  } catch (err) {
    results.items[name] = { pass: false, error: String(err?.stack || err) };
    log("FAILED", name, err);
  } finally {
    await page.unroute("https://www.youzign.com/api/bugreport").catch(() => {});
  }
}

// ---------- Item 6: not-found identifier ----------
async function testNotFound(page) {
  const name = "6-not-found";
  const identifier = "zzz-nobody";
  try {
    await resetDb(page);
    await clickByText(page, "button,a", /^backup$/);
    await page.waitForTimeout(300);
    await clickByText(page, "button", /find my designs/i);
    await page.waitForSelector("#legacy-identifier");
    await page.fill("#legacy-identifier", identifier);
    await page.evaluate(() => {
      const f = document.querySelector('[data-testid="legacy-import-modal"] form');
      f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });
    // Wait for either a friendly not-found message or (guard) the welcome text —
    // give it real time since the backend may retry/404.
    await page.waitForTimeout(6000);
    const modalText = await page.evaluate(
      () => document.querySelector('[data-testid="legacy-import-modal"]')?.textContent || ""
    );
    await page.screenshot({ path: shot("12-not-found.png") });
    log("not-found modal text snippet:", modalText.slice(0, 400));

    const looksFriendly = /couldn.t find|no designs|not found|no account|no results|check the/i.test(modalText);
    const looksLikeCrash = /error|exception|undefined|NaN/i.test(modalText) && !looksFriendly;

    results.items[name] = { pass: looksFriendly && !looksLikeCrash, modalTextSnippet: modalText.slice(0, 600) };
  } catch (err) {
    results.items[name] = { pass: false, error: String(err?.stack || err) };
    log("FAILED", name, err);
  }
}

// ---------- main ----------
const browser = await webkit.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage();

const allConsoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") {
    const text = msg.text();
    const cls = classifyConsole(text);
    allConsoleErrors.push({ text, cls });
    if (cls === "real") results.consoleErrors.push(text);
    else results.consoleErrorsIgnored.push(text);
  }
});
page.on("pageerror", (err) => {
  results.consoleErrors.push(`[pageerror] ${err.message}`);
});

// Simple per-test console error window tracker for item 4.
function makeConsoleTracker() {
  let active = false;
  let startIdx = 0;
  return {
    start() {
      active = true;
      startIdx = allConsoleErrors.length;
    },
    stop() {
      active = false;
      const slice = allConsoleErrors.slice(startIdx).filter((e) => e.cls === "real");
      return { errors: slice.map((e) => e.text) };
    },
  };
}
const consoleTracker = makeConsoleTracker();

try {
  await testDashboardSanity(page);
  await testLegacyImportDarkknight(page);
  await testClipartRecolor(page);
  await testLegacyFont(page, consoleTracker);
  await testBugReportForm(page);
  await testNotFound(page);
} catch (fatal) {
  console.error("FATAL", fatal);
  results.fatal = String(fatal?.stack || fatal);
} finally {
  await browser.close();
}

fs.writeFileSync(shot("webkit-results.json"), JSON.stringify(results, null, 2));
console.log("\n=== WEBKIT E2E RESULTS ===");
for (const [k, v] of Object.entries(results.items)) {
  console.log(`${v.pass ? "PASS" : "FAIL"} — ${k}`);
}
console.log(`console errors (real): ${results.consoleErrors.length}`);
console.log(`console errors (ignored, Google Fonts CORS noise): ${results.consoleErrorsIgnored.length}`);
console.log("RESULTS WRITTEN:", shot("webkit-results.json"));
console.log("WEBKIT E2E DONE");
