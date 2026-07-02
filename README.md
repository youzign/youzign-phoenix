# Youzign Next

A local-first, open-source resurrection of the 2015 **Youzign** DOM design editor.
The point of this repo is **fidelity to legacy designs**: parse, round-trip
serialize, and faithfully render the original XML "designstring" format in React —
so a 10-year-old Flash-era design file renders correctly in a modern browser.

As of **Milestone 3** the app is a real **editor** (not just a viewer): select,
move, resize, rotate, edit text, add text/shapes, undo/redo, and export — all
while keeping the designstring model valid so `serialize()` always produces
round-trippable XML.

## One-command run

```bash
pnpm install && pnpm dev   # editor on http://localhost:5191
```

Other scripts:

```bash
pnpm build   # tsc for libs + vite build for the app (all workspaces)
pnpm test    # vitest across packages
pnpm shots   # screenshot the running dev server (needs it running on :5191)
```

## Architecture

A pnpm workspace monorepo, TypeScript throughout.

| Package | What it is |
| --- | --- |
| `packages/designstring` | Pure TS, no React. The data model (`Design` + `Item` union), the Flash-faithful color utils (`signedIntToHex`/`hexToSignedInt`/glyph colors), and `parse()` / `serialize()`. Every node keeps a raw-attribute bag so unknown attributes survive a round-trip and `parse(serialize(parse(x)))` deep-equals `parse(x)`. |
| `packages/renderer` | React. `<DesignCanvas design zoom />` plus per-type item components. Ports the legacy `Utils.ts` matrix math (image/clipart center-based placement, the Flash text matrix `createTextMatrix`, group nesting) and the `PanelBackgroundGradient` background logic. |
| `packages/editor-core` | Pure TS, no React. Editor state helpers: `patchItem` (syncs the typed view **and** `rawAttrs` so serialize stays valid), `setTextColor` / `setShapeFill`, item factories (`createTextItem`, `createShapeItem`), parametric SVG `shapes`, and `itemBox` selection geometry. Round-trip guarded by tests. |
| `apps/editor` | Vite + React + Tailwind **editor** (dark, Figma-style) on port **5191**. Zustand store with undo/redo history + localStorage autosave. Top bar (editable name, undo/redo, zoom, Import/Export XML, Export PNG, template dropdown), left tool rail (Shapes live; Search/Icons/Generate = coming-soon), center canvas with a selection/manipulation overlay, right properties panel. |

## Editor (Milestone 3)

**What works**

- **Shell** — dark top bar (Youzign logo, editable design name, undo/redo, zoom ±, Import/Export XML, Export PNG), left icon rail (Search/Icons/Generate placeholders + a live **Shapes** tab), center canvas on a neutral workspace, right properties panel.
- **Select & manipulate** — click to select (blue box + handles), drag to move, corner handles to resize (rotation-aware, Shift = aspect-lock), rotation handle (Shift = 15° snap), arrow-key nudge (Shift = ×10), Delete to remove.
- **Text** — double-click to edit inline (contentEditable); properties for font size, bold/italic/underline, alignment, and a single fill color. Per-glyph `@@@` colors are preserved until you recolor, then collapse to uniform (spec §3).
- **Items** — add text, add any of 6 parametric shapes (rect, ellipse, triangle, star, arrow, line), duplicate, delete, bring-to-front / send-to-back.
- **Shapes** are stored as `clipart` nodes whose `source` is an inline SVG data-URI (plus `shape_kind` / `shape_fill` attrs) — no renderer change needed, and they round-trip as valid designstring.
- **State/IO** — Zustand store, undo/redo history (one step per drag gesture), localStorage autosave per design name, Export XML (`serialize`) download, Export PNG (`html-to-image` of the canvas node), Import XML file input, fixture/template dropdown.
- **Fidelity guard** — opening a fixture and making no edits re-serializes byte-identically; a single-item edit changes exactly one serialized line (see `packages/editor-core/test/mutations.test.ts`).

**Known rough edges**

- Text resize is via the Font-size field / proportional handles only — corner resize handles are intentionally hidden for text (the Flash text matrix makes free-resize lossy); move + rotate + font-size cover the demo.
- Selection is top-level items only (group children aren't individually selectable); the group selection box is an approximation of its bounds.
- Multi-select is not implemented (was optional).
- Custom font picker is not wired (new text uses Arvo, matching the loaded Google font).

Screenshot: `docs/shots/editor-v0.png` (mountains fixture, a title text selected, a blue star just inserted). Regenerate with `node scripts/shot-editor.mjs` (dev server on :5191).

Both legacy sample designstrings are committed verbatim as fixtures at
`apps/editor/src/fixtures/mountains-input.xml` and `mountains-output.xml`.

## Fidelity status

| Implemented | Pending |
| --- | --- |
| Canvas solid background (`bg_type="color"`) | Patterns (`bg_type="pattern"`) |
| Gradient background (linear + radial, legacy angle mapping) — unit-tested | Background image (`bg_type="image"`) |
| Images with graceful 404 → bounded placeholder showing the URL | SWF (Flash) clipart source (`.swf` legacy URLs; the `source_svg` equivalent renders) |
| SVG clipart: fetched, sanitized, inlined, and recolored (legacy per-`Layer` `@@@` color bands → path `fill`); non-SVG source falls back to the image path; 404 → colored bounded placeholder | |
| Per-glyph text color (runs merged into `<span>`s) | `text-curved` layout (parsed & round-tripped, not yet laid out on an arc) |
| Text positioning via the Flash text matrix (`mcWidth/textAreaWidth` scale) | |
| Shadows (`is_shadow`, `shadow_distance`/`_angle`/`_color`/`_opacity`) — legacy `drop-shadow(cosθ·d, sinθ·d, 10px, rgba(color,opacity))`; editable | Image cropping / flip-crop |
| Blur (`is_blur`, `blur_size`) — legacy `blur(blur_size / 2)`; editable | |
| Borders (`is_border`, `border_size`, `border_color`) — non-text: legacy 8-direction `drop-shadow` outline; text: `text-shadow` ring outline (+ no-fill); editable | |
| Groups / one-level nesting, group scale/rotation/opacity | |
| Opacity, rotation, hFlip/vFlip | |
| Round-trip `parse`/`serialize` (deep-equal + string-stable) | |
| Unknown-attribute preservation (forward-compat) | Custom uploaded fonts (only Google-hosted Arvo is wired) |
| Font family from the `font` attr (Arvo loaded via Google Fonts) | Filters (`<filter>` item is parsed but a visual no-op) |

### A note on the color values

The color conversion is an exact port of the legacy `intToHex` (`Utils.ts`).
The build spec listed two sample hexes that are transcription typos; the
authoritative algorithm produces:

- `16513009 → #fbf7f1` ✓ (matches spec)
- `14628964 → #df3864` (spec said `#df3a64`)
- `8281250  → #7e5ca2` (spec said `#7e57e2`)
- `3289650  → #323232` ✓
- `-1 → #ffffff`, `-16777216 → #000000` ✓

Tests assert the algorithm-faithful values.

## Screenshots

`docs/shots/full-canvas.png` and `docs/shots/with-xml-panel.png` — the
`mountains-input.xml` design rendered at zoom 0.6. The S3 hero photo 404s (expected;
the bounded placeholder is the deliverable), so the dark-gray Arvo text sits over a
placeholder rather than the photo.

`docs/shots/clipart.png` — the offline `clipart-local.xml` fixture (local SVGs in
`apps/editor/public/clipart/`) proving clipart rendering fully without network:
recolored triangle/circle/star, a two-`Layer` "duo" SVG showing per-band `@@@`
recoloring (blue top / pink bottom), and a rotated star. The real triangle-cluster
clipart in `mountains-input.xml` points at live S3/youzign.com URLs that 404 in this
environment and falls back to the bounded placeholder. Regenerate with
`node scripts/shot-clipart.mjs` (dev server running on :5191).
