# Fix: user-imported photos missing from Export PNG and dashboard thumbnails (WebKit)

## Context

Youzign Phoenix is a Tauri v2 desktop design editor. On macOS it runs in WKWebView (WebKit).
Repo: this worktree, branch `fix/export-webkit-images`, based on the shipped v1.0.3 release.

**User-visible bug (reproduced on shipped v1.0.3):** a design with 9 user-imported photos
(each a 3–5 MB `data:image/png;base64,` URI, canvas 1600×900) renders perfectly in the live
editor, but:
- "Export PNG" produces a PNG containing ONLY the CSS background gradient and small
  inline-SVG clipart — all large `<img>` photo layers are blank/missing.
- The dashboard thumbnail (same capture path) is blank or background-only.

## Root cause (already diagnosed — do not re-litigate)

Both paths rasterize the live `.yz-canvas` DOM node with `html-to-image` (`toPng`/`toJpeg`):
- Export: `apps/editor/src/export/runExport.ts`
- Thumbnail: `apps/editor/src/App.tsx` → `captureDashboardThumb()` (~line 35–51)

`html-to-image` clones the subtree into an SVG `<foreignObject>`, loads that SVG into a new
`Image`, and draws it to a canvas. **WebKit/Safari has a long-standing bug: subresource
images inside a foreignObject SVG are not guaranteed to be loaded/decoded when the SVG's
`load` event fires**, so the first draw renders the inner `<img>` elements blank. Large
data-URI images (multi-MB) are the worst case; tiny images often sneak through. Chrome is
unaffected — which is why the repo's existing puppeteer/Chrome scripts never caught it.

v1.0.3 already ships `apps/editor/src/export/exportReadiness.ts` (`ensureExportImages`),
which awaits `load` + `decode()` on the ORIGINAL live `<img>`s before capture. That is
necessary but NOT sufficient: the blank draw happens on the CLONED images inside
html-to-image's generated SVG, which that code never touches. Also `captureDashboardThumb`
in App.tsx has no readiness logic at all.

## Task

1. **Reproduce first.** Add a Playwright WebKit e2e test (playwright is already installed at
   the workspace root; the `webkit` browser binary is downloaded and verified working).
   Model it on `scripts/e2e-update.mjs` (spawns vite for `@youzign/editor` on a dedicated
   port, drives the app, asserts, cleans up). Use a fresh port (not 5211, not 5173, not 1420).
   Test flow:
   - Build workspace packages first like e2e-update.mjs does (`pnpm --filter ./packages/* -r build`).
   - Generate ~6 large data-URI PNGs programmatically (random noise via node canvas-less:
     e.g. build raw RGBA → encode PNG with a tiny pure-JS encoder, or draw noise in the page
     itself via an offscreen canvas and `toDataURL` — in-page is simplest). Each should be
     ≥ 2 MB as a data URI and e.g. 1200×900 px, to mirror the real failure.
   - Create a design and add those images as image layers. Prefer driving the real app flows;
     if that's impractical, add a small dev-only test hook (e.g. `window.__yzTest` exposed
     when `import.meta.env.DEV`) that creates a document and calls the same store actions
     (`addPhoto` / `createImageItem`) the UI uses. Keep any hook minimal and dev-only.
   - Wait until the editor shows the images, then call the real export path (`runExport`
     returns the data URL of the first page — designed for tests) at scale 1, PNG.
   - **Assert on pixels:** decode the returned PNG and check that the regions where the
     photo layers sit are NOT the background color (sample several points per layer).
     A helper that counts non-background pixels is fine. The test MUST fail on the current
     code in WebKit before you write the fix (verify and note this — if it does not fail,
     stop and investigate; do not proceed to a fix for a bug you cannot reproduce).
   - Also cover the thumbnail path: after the design has images, trigger/invoke the same
     capture used by `captureDashboardThumb` and pixel-check the JPEG similarly.
   - Wire it as `node scripts/e2e-export-webkit.mjs` (script, like the existing e2e), and add
     a root package.json script `test:e2e-export`.

2. **Fix.** In the capture layer (shared by export and thumbnail):
   - Extract a shared `capture` helper (e.g. `apps/editor/src/export/capture.ts`) that both
     `runExport.ts` and `App.tsx`'s `captureDashboardThumb` use, so the fix exists in one place.
   - Keep `ensureExportImages` (load + decode of originals), and apply it in the thumbnail
     path too.
   - Add the WebKit-safe capture strategy: render-until-stable. Call the html-to-image
     capture repeatedly (cap ~5 attempts, small delay / double-rAF between attempts) until
     two consecutive results are byte-identical AND at least 2 attempts have run. Rationale:
     the first WebKit pass draws inner images blank; once they are decoded, consecutive
     renders are identical. If results never stabilize, return the last attempt (do not throw).
   - Stronger signal where cheap: you know the image layers' geometry — after a capture you
     MAY pixel-sample the result to detect "image regions are all background" and retry.
     Use this only if straightforward with the data available at the call site; the
     stability loop is the required baseline.
   - Only loop when needed: gate extra attempts on the result changing; Chrome will
     typically stabilize on attempt 2 with negligible cost.
   - Thumbnail specifics (App.tsx): the 800 ms autosave debounce fires while data URIs are
     still decoding right after a design loads — make the thumb capture await
     `ensureExportImages` on `.yz-canvas` first, and use the shared stable-capture helper.
     Keep the existing 5 s re-capture throttle behavior.
3. **Keep everything else identical:** file naming, PDF/JPG paths, transparent PNG handling,
   multi-page export, `saveDataUrl`/`saveBytes` native calls, existing tests. Match house
   code style (TypeScript, small pure modules, existing comment tone). Update/extend the
   existing vitest unit tests (`test/export-readiness.test.ts`, `test/export.test.ts`) for the
   new helper — unit-test the stability loop with a fake capture fn (first call returns A,
   then B, then B → expect B and 3 calls).

## Verification (all must pass; show output)

- `node scripts/e2e-export-webkit.mjs` — fails before fix (record the failing assertion in
  your summary), passes after.
- `pnpm --filter @youzign/editor test` (vitest) — all green.
- `pnpm -r build` — clean.
- Do NOT commit; leave changes in the working tree for review.

## Out of scope

- Do not upgrade or fork html-to-image.
- Do not touch the Tauri/rust side, release scripts, or landing pages.
- Do not refactor the renderer (`packages/renderer`).
