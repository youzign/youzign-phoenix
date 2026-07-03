import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await b.newPage();
await page.setViewport({ width: 1400, height: 1100 });
await page.goto("http://localhost:5207/", { waitUntil: "networkidle2" });
await new Promise(r=>setTimeout(r,800));
const uid = await page.evaluate(async () => {
  const img = new Image(); img.src = "/sample-photo.png";
  await new Promise((res) => (img.onload = res));
  const st = window.__editor.getState();
  st.addPhoto({ source: "/sample-photo.png", width: img.naturalWidth, height: img.naturalHeight, at: { x: 400, y: 320 } });
  return window.__editor.getState().selectedUids[0];
});
// crop inward via store-level path? No - emulate handle drag. Find handle positions:
const info = await page.evaluate((u) => {
  const st = window.__editor.getState();
  const it = st.design.items.find((i) => i._uid === u);
  return { xpos: it.xpos, ypos: it.ypos, width: it.width, height: it.height, zoom: st.zoom };
}, uid);
console.log("item:", info);
// locate the right-edge handle DOM: handles are divs with cursor styles
const handles = await page.evaluate(() => {
  return [...document.querySelectorAll('div')].filter(d => d.style.cursor && d.style.cursor.includes('resize')).map(d => { const r = d.getBoundingClientRect(); return { cur: d.style.cursor, x: r.x + r.width/2, y: r.y + r.height/2 }; });
});
console.log("handles:", handles);
const rightH = handles.filter(h => h.cur === "ew-resize").sort((a,b)=>b.x-a.x)[0];
// drag inward 60px
await page.mouse.move(rightH.x, rightH.y); await page.mouse.down();
await page.mouse.move(rightH.x - 60, rightH.y, { steps: 10 }); await page.mouse.up();
await new Promise(r=>setTimeout(r,1500));
const after1 = await page.evaluate((u) => {
  const it = window.__editor.getState().design.items.find((i) => i._uid === u);
  return { width: it.width, hasFull: !!it._fullSource, cropRect: it._cropRect, src: it.source.slice(0,30) };
}, uid);
console.log("after inward:", after1);
// now find right handle again and drag OUTWARD 80px
const handles2 = await page.evaluate(() => [...document.querySelectorAll('div')].filter(d => d.style.cursor === 'ew-resize').map(d => { const r = d.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; }));
const rightH2 = handles2.sort((a,b)=>b.x-a.x)[0];
await page.mouse.move(rightH2.x, rightH2.y); await page.mouse.down();
await page.mouse.move(rightH2.x + 80, rightH2.y, { steps: 12 });
await page.screenshot({ path: "docs/shots/uncrop.png" });
const during = await page.evaluate((u) => {
  const it = window.__editor.getState().design.items.find((i) => i._uid === u);
  return { width: it.width };
}, uid);
await page.mouse.up();
await new Promise(r=>setTimeout(r,1500));
const after2 = await page.evaluate((u) => {
  const it = window.__editor.getState().design.items.find((i) => i._uid === u);
  return { width: it.width, hasFull: !!it._fullSource };
}, uid);
console.log("during outward:", during, "after outward:", after2);
await b.close();
if (!(after1.width < 720 && after1.hasFull && after2.width === 720)) { console.error("UNCROP ASSERTION FAILED"); process.exit(1); }
console.log("UNCROP OK: 720 -> " + after1.width + " -> " + after2.width);
