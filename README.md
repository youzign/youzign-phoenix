# Youzign Next

A local-first, open-source resurrection of the 2015 **Youzign** DOM design editor.
The point of this repo is **fidelity to legacy designs**: parse, round-trip
serialize, and faithfully render the original XML "designstring" format in React —
so a 10-year-old Flash-era design file renders correctly in a modern browser.

Editing/UI polish is deliberately out of scope for now; this is the rendering and
data-model core.

## One-command run

```bash
pnpm install && pnpm dev   # editor viewer on http://localhost:5191
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
| `apps/editor` | Vite + React + Tailwind viewer shell (dark UI) on port **5191**: fixture dropdown, zoom slider, XML source side-by-side. |

Both legacy sample designstrings are committed verbatim as fixtures at
`apps/editor/src/fixtures/mountains-input.xml` and `mountains-output.xml`.

## Fidelity status

| Implemented | Pending |
| --- | --- |
| Canvas solid background (`bg_type="color"`) | Patterns (`bg_type="pattern"`) |
| Gradient background (linear + radial, legacy angle mapping) — unit-tested | Background image (`bg_type="image"`) |
| Images with graceful 404 → bounded placeholder showing the URL | SWF/SVG clipart **shape** rendering (currently a colored bounded box) |
| Per-glyph text color (runs merged into `<span>`s) | `text-curved` layout (parsed & round-tripped, not yet laid out on an arc) |
| Text positioning via the Flash text matrix (`mcWidth/textAreaWidth` scale) | Shadows (`shadow_*`) |
| Groups / one-level nesting, group scale/rotation/opacity | Blur (`is_blur`, `blur_size`) |
| Opacity, rotation, hFlip/vFlip | Borders (`is_border`, `border_size`) |
| Round-trip `parse`/`serialize` (deep-equal + string-stable) | Image cropping / flip-crop |
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
