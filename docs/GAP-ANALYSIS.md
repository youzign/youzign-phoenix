# Legacy Youzign (2015–2017) vs youzign-next — Feature Gap Analysis
*Audited 2026-07-02 against shallow clones of youzign/{editor,theme,youzign-local}. Legend: ✅ have · 🟡 partial · ❌ missing · 🪦 obsolete/out-of-scope · ⚖️ deliberate divergence.*

## Where we EXCEED legacy
Multi-select + marquee (legacy was single-item only), working crop (legacy's was an "alert soon" stub), curved-text *editing* (legacy was load-only; Flash rendered it), free zoom, AI generate, per-glyph text color preservation, offline parametric shapes. Copy/paste, snapping, layers panel, multi-page, letter-spacing/line-height never existed in legacy either.

## Genuine gaps (prioritized, impact × effort)
1. **Canvas size flow** — new-design + ~70 size presets (`editor/assets/xml/setting.xml`, no S3 dep) + custom W×H resize. Every design currently stuck at fixture size. HIGH/low.
2. **Background editing panel** — solid + transparent toggle + gradient editor (25 presets) + canvas border. Renderer already supports all of it; UI-only. HIGH/med.
3. **Export parity** — JPG (q.95), PDF (jsPDF), ×1–×5 scale multiplier, transparent PNG. Pure client-side. HIGH/low.
4. **Local image upload (My uploads)** — file input/drag-drop → data URI. Only way users get own photos in. HIGH/low.
5. **Parity basket (tiny)** — Flip H/V UI (already renders!), center-H/V on canvas, ⌘D duplicate, ⌘B/I/U, strikethrough toggle (already in model). MED/very-low.
6. **Lock/unlock + one-step z-order (forward/backward)**. MED/low.
7. **Dropped item properties (fidelity!)** — per-item blend modes (16), invert effect (`isInvert`/`invertIntensity`), image corner radius (uniform + per-corner). Legacy designs using these render wrong today. MED-HIGH/med.
8. **Canvas filters** — 15 CSS looks (Grayscale…Cool); currently parsed but visual no-op. Fidelity-critical. MED/low-med.
9. **Per-Layer clipart recolor swatches** — multi-band SVGs collapse to uniform on recolor. MED/med.
10. **Grid + guides; local "My designs" gallery** (localStorage list/rename/delete; pre-Tauri). MED/med.

## Smaller notes
- Text shortcuts (⌘↑↓ size, ⌘←→ width — legacy had the arrows swapped, a bug), keyboard-help popup, preview mode, image replace, new-from-image-URL: minor misc.
- Fonts: we ship a curated Google list; legacy had the full catalog + uploads (uploads were S3-dead anyway). 🟡
- Color picker: legacy had eyedropper + brand colors + saved/recent palettes; we have native picker. 🟡 Branding kit (colors/texts) is localStorage-recreatable. ❌→easy
- Templates library: needs the prod-DB designstring dump (WP `templates` post type). Saved groups/uploads: S3-dead.
- Stock: Unsplash ✅ (built-in key); StockUnlimited 🪦 defunct; Icons8 endpoint 🪦; Iconify exceeds. Freepik ❌ (BYOK recreatable).
- BG removal: legacy used Deep-Image.ai + ClippingMagic SaaS → replaced by local ONNX (feat/bg-removal, in progress).
- 🪦 out of scope OSS v1: marketplace, teams/share/push, suggest-template, server saves.

## Bertrand's direction on the next wave (2026-07-02)
- **Canvas sizes**: refresh the 2016 preset list — kill dead platforms (Google+), update dims to current platform specs; keep custom W×H. **Smart resize** is the big win: on canvas resize, elements scale proportionally and stay constrained (Canva-style) — legacy always cropped weirdly or left elements too small.
- **Basket**: + image round corners, grouping objects.
- **Selection handles = Canva behavior**: image edge handles (top/bottom/left/right middles) CROP; corner handles keep aspect BY DEFAULT, Shift breaks constraint (invert current behavior); selection chrome rounded & friendly, not sharp/boxy.
- **Grid + smart snap guides**: object-to-object alignment lines, auto-snap (Canva-style).
- **fal-powered magic tools** (after basics): magic grab (segmentation), magic eraser/remove, magic blur — the Canva magic suite via fal endpoints.

## Legacy oddities found
`HISTORY_STEPS=50` never enforced (undo unbounded); ⌘←/→ text-width keycodes swapped; legacy crop button was an alert stub; "Pexels/Stocksnap/Skitterphoto" tabs were all Pixabay user-filters.
