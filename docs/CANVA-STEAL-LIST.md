# Canva Steal List — research sweep (2026-07-02)
*Web-only research: Canva Help Center, Design School, blog, third-party reviews. Cross-referenced against youzign-next's current state. Correction vs raw report: we do NOT have multi-page yet (workstream queued).*

## Magic Studio inventory → fal mapping
Have already: text-to-image (flux/schnell), Magic Eraser (bria/eraser), Magic Grab (SAM2+fill), BG Remover (local U²-Netp), Magic Blur (local), Magic Switch≈smart resize.
Cheap high-impact gaps (single fal endpoints, slot into existing Magic panel):
- **Magic Edit** (brush + prompt inpaint) → fal-ai/flux-pro/v1/fill; mask painter already exists.
- **Magic Expand** (outpaint) → fal-ai/bria/expand (direct match).
- **Magic Enhance/Upscale** → fal-ai/clarity-upscaler / esrgan / aura-sr.
- **Grab Text** (OCR baked text → editable text layer + erase original) → florence-2/PaddleOCR + eraser.
Later: Magic Write (any LLM), Magic Morph (img2img+ControlNet), translate (LLM). Skip: Magic Design/Media/Animate/video suite, Canva AI 2.0 conversational layer, comments/collab, Smartmockups, Giphy.

## Text Effects panel (parameter-level, all pure CSS/SVG — zero API cost)
Style effects (mutually exclusive): **Shadow** (offset/direction°/blur/transparency/color), **Lift** (intensity), **Hollow** (thickness), **Splice** (thickness/offset/direction/color), **Echo** (offset/direction/color), **Glitch** (offset/direction/color RGB-split), **Neon** (intensity, glow follows text color), **Background** (roundness/spread/transparency/color). Shape: **Curve** (signed slider). No standalone "Outline" — that's Hollow or Splice.
Toolbar extras we lack: text case toggle, justify, line-spacing/letter-spacing panel, vertical anchor, lists.
Font combinations = clickable pre-styled heading+subheading+body groups (Text panel section).

## Content patterns (ranked value-for-effort)
1. **Frames** — shape-clipped image placeholders, drag-photo-to-fill, double-click pan/zoom. THE missing Canva primitive.
2. **Grids** — multi-cell collages + gutter slider (reuses frame engine).
3. **Element packs** — matched-style sets + per-path recolor ("more from this set").
4. **Tables** — per-cell toolbar. 5. **Charts** — bar/line/pie first, side-panel data table, CSV import. Defer: mockups, GIFs.

## Interaction niceties
- **Floating contextual selection toolbar** (morphs per type) — biggest "Canva feel" jump vs our side panel.
- **Align/Distribute/Tidy-up** (Alt+Shift+T) — steal Arrange half only; NO X/Y fields (directive #2).
- **Copy style / Paste style** (right-click + shortcut) — cheap, delightful.
- **/ command palette** (type-to-insert/run); single-key inserts T/R/C/L.
- **Rulers (Shift+R) + draggable guides + margins + print bleed** (0.125in/3.175mm + crop marks) — matters for PDF/print path.
- Right-click context menu (copy/paste style, set-as-background, replace image, group).

## Pages model (for the queued multi-page workstream)
Page strip: numbered thumbnails, hover cluster (add/duplicate/delete/lock/notes), "+ Add page", drag-reorder, multi-select pages, grid view toggle, per-page titles + notes + background, export whole doc or page-range ("Select pages" in download dialog).

## Top-12 priority (impact × effort, given current state)
1. Floating contextual selection toolbar
2. Text styled-effects presets (Lift/Hollow/Splice/Echo/Glitch/Neon/Background)
3. Frames
4. Grids
5. Grab Text (OCR)
6. / command palette
7. Magic Expand + Magic Enhance/Upscale
8. Align + Distribute + Tidy-up (no X/Y)
9. Copy/Paste style
10. Font combinations (in flight — text-studio workstream)
11. Multi-page: strip + hover controls + grid view + page-range export (queued workstream)
12. Ruler guides + margins/bleed for print-grade PDF
