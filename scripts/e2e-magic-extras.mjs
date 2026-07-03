import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const KEY = process.env.FAL_KEY;
if (!KEY) {
  console.error("FAL_KEY is required for real Magic extras E2E.");
  process.exit(1);
}

const log = (...a) => console.log("[e2e]", ...a);

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});
const page = await b.newPage();
await page.setViewport({ width: 1400, height: 1100 });
await page.evaluateOnNewDocument((key) => {
  localStorage.setItem("youzign-next:library-keys", JSON.stringify({ fal: key }));
}, KEY);
await page.goto("http://localhost:5209/", { waitUntil: "networkidle2" });
await page.waitForFunction(() => window.__editor?.getState);
// Pre-warm lazy modules so Vite dep-optimization can't force-reload mid-test.
await page.evaluate(() =>
  Promise.allSettled([
    import("/src/magic/endpoints.ts"),
    import("/src/magic/raster.ts"),
    import("/src/library/generate.ts"),
  ])
);
await new Promise((r) => setTimeout(r, 2500));
await page.reload({ waitUntil: "networkidle2" });
await page.waitForFunction(() => window.__editor?.getState);
log("page ready");

// All heavy data (sources, pixels) stays in-page in window.__stash — only
// scalars cross the CDP boundary ("Promise was collected" guard).
await page.evaluate(() => {
  window.__stash = {};
  window.__helpers = {
    async natural(src) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      await new Promise((res, rej) => ((img.onload = res), (img.onerror = rej)));
      return { width: img.naturalWidth, height: img.naturalHeight };
    },
    item(u) {
      return window.__editor.getState().design.items.find((i) => i._uid === u);
    },
  };
});

async function inPage(fnBody, arg) {
  // GC-immune async evaluate: fire the async fn, stash the result, poll for it.
  await page.evaluate(
    (body, a) => {
      window.__stash.r = undefined;
      const fn = new Function("arg", `return (async () => { ${body} })();`);
      fn(a).then(
        (v) => (window.__stash.r = { ok: true, v }),
        (e) => (window.__stash.r = { ok: false, e: String(e) })
      );
    },
    fnBody,
    arg
  );
  await page.waitForFunction(() => window.__stash.r !== undefined, { timeout: 60000, polling: 300 });
  const r = await page.evaluate(() => window.__stash.r);
  if (!r.ok) throw new Error("in-page: " + r.e);
  return r.v;
}

async function addSample(at) {
  return await inPage(
    `const n = await window.__helpers.natural("/sample-photo.png");
     const st = window.__editor.getState();
     st.addPhoto({ source: "/sample-photo.png", width: n.width, height: n.height, at: arg });
     return window.__editor.getState().selectedUids[0];`,
    at
  );
}

async function waitMagic(label) {
  await page
    .waitForFunction(() => window.__editor.getState().magicBusy, { timeout: 20000 })
    .catch(() => {});
  await page.waitForFunction(() => !window.__editor.getState().magicBusy, {
    timeout: 180000,
    polling: 500,
  });
  const err = await page.evaluate(() => window.__editor.getState().magicError?.message ?? null);
  if (err) {
    console.error(label + " failed:", err);
    await b.close();
    process.exit(1);
  }
  log(label, "completed");
}

// ---- Magic Edit ----
const editUid = await addSample({ x: 240, y: 180 });
log("edit: sample inserted", editUid);
await page.evaluate((u) => {
  window.__stash.editBefore = window.__helpers.item(u).source;
  const c = document.createElement("canvas");
  c.width = 360;
  c.height = 260;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 360, 260);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(180, 130, 54, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  void window.__editor.getState().applyMagicEdit(u, c.toDataURL("image/png"), "replace the masked area with a bright red apple");
}, editUid);
await waitMagic("Magic Edit");
const regionDiff = await inPage(
  `async function pixels(src) {
    const img = new Image(); img.crossOrigin = "anonymous"; img.src = src;
    await new Promise((res, rej) => ((img.onload = res), (img.onerror = rej)));
    const c = document.createElement("canvas"); c.width = 360; c.height = 260;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 360, 260);
    return ctx.getImageData(0, 0, 360, 260).data;
  }
  const [pa, pb] = await Promise.all([pixels(window.__stash.editBefore), pixels(window.__helpers.item(arg).source)]);
  let diff = 0, n = 0;
  for (let y = 86; y < 174; y++) for (let x = 126; x < 234; x++) {
    const i = (y * 360 + x) * 4;
    diff += Math.abs(pa[i] - pb[i]) + Math.abs(pa[i+1] - pb[i+1]) + Math.abs(pa[i+2] - pb[i+2]);
    n++;
  }
  return diff / n;`, editUid);
log("edit: masked-region mean diff =", regionDiff.toFixed(2));
if (regionDiff < 8) {
  console.error("MAGIC EDIT ASSERTION FAILED: masked region barely changed", regionDiff);
  await b.close();
  process.exit(1);
}

// ---- Magic Expand ----
const expandUid = await addSample({ x: 620, y: 180 });
log("expand: sample inserted", expandUid);
const expandBefore = await inPage(
  `const it = window.__helpers.item(arg);
   const nat = await window.__helpers.natural(it.source);
   return { w: it.width, natW: nat.width, natH: nat.height };`, expandUid);
await page.evaluate((u) => {
  void window.__editor.getState().applyMagicExpand(u, "16:9");
}, expandUid);
await waitMagic("Magic Expand");
const expandAfter = await inPage(
  `const it = window.__helpers.item(arg);
   const nat = await window.__helpers.natural(it.source);
   return { w: it.width, natW: nat.width, natH: nat.height, hasFull: !!it._fullSource };`, expandUid);
log("expand:", expandBefore, "->", expandAfter);
if (
  expandAfter.natW <= expandBefore.natW ||
  expandAfter.w <= expandBefore.w ||
  expandAfter.hasFull
) {
  console.error("MAGIC EXPAND ASSERTION FAILED", { expandBefore, expandAfter });
  await b.close();
  process.exit(1);
}

// ---- Upscale ----
const upscaleUid = await addSample({ x: 400, y: 470 });
log("upscale: sample inserted", upscaleUid);
const upBefore = await inPage(
  `const it = window.__helpers.item(arg);
   const nat = await window.__helpers.natural(it.source);
   return { w: it.width, h: it.height, natW: nat.width };`, upscaleUid);
await page.evaluate((u) => {
  void window.__editor.getState().applyMagicUpscale(u);
}, upscaleUid);
await waitMagic("Upscale/Enhance");
const upAfter = await inPage(
  `const it = window.__helpers.item(arg);
   const nat = await window.__helpers.natural(it.source);
   return { w: it.width, h: it.height, natW: nat.width };`, upscaleUid);
log("upscale:", upBefore, "->", upAfter);
if (upAfter.natW < upBefore.natW * 1.5 || upAfter.w !== upBefore.w || upAfter.h !== upBefore.h) {
  console.error("UPSCALE ASSERTION FAILED", { upBefore, upAfter });
  await b.close();
  process.exit(1);
}

await b.close();
console.log("MAGIC EXTRAS OK", {
  editRegionDiff: Number(regionDiff.toFixed(2)),
  expand: { before: expandBefore, after: expandAfter },
  upscale: { before: upBefore, after: upAfter },
});
