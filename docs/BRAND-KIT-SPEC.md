# Brand Kit v1 — spec & plan
*Written 2026-07-04 (handoff from the side-pill chat). Owner directive: simple, not overkill — Canva's model right-sized for a local-first OSS app.*

## What Canva does (reference model)
Brand Kit = named brand holding: logos, color palette(s), brand fonts (heading/body defaults), brand photos/graphics. In the editor: a pinned **"Brand" section at the top of every color picker** (one-click swatches) and a **"Brand fonts" section at the top of the font picker**. Multiple brands, one active. (canva.com/learn/how-to-build-a-brand-kit — 403s scripted fetches; model reconstructed from product knowledge.)

## v1 scope (keep)
- **Named brands, one active.** `Brand = { id, name, colors: string[] /* ordered hex */, fonts: { heading?: string; body?: string } /* Google-Fonts family names */, createdAt }`. Metadata in localStorage (small, follows `library/settings.ts` pattern). Multiple brands; a simple active-brand switcher.
- **Brand assets (logos/images)** = uploads tagged with a `brandId`. REUSE `library/uploads.ts` IndexedDB machinery (images are big; localStorage would blow quota) — either a `brandId?: string` field on `UploadRecord` + filtered queries, or a parallel object store copying the uploads pattern. Prefer the tag: one image pipeline, no duplicate downscale/validation code.
- **Colors everywhere there's a picker:** `ColorSwatch` in `apps/editor/src/components/ui.tsx` (~line 392) is the shared popover primitive → add a "Brand" swatch row at the top of its popover (active brand's colors, one click applies + closes). Because everything routes through ColorSwatch this is ONE edit — but VERIFY other pickers: background panel, effects/shadow colors, text fill; any that bypass ColorSwatch get the same row.
- **Fonts:** pinned "Brand fonts" mini-section (heading + body) at the top of the searchable Google-Fonts picker; `ensureGoogleFonts` (apps/editor/src/fonts.ts) already handles loading.
- **Brand tab** in the left rail (Photos/Icons/Text/Elements/Create + **Brand**): manage brands (create/rename/delete/set-active), edit palette (add/remove/reorder swatches via ColorSwatch), pick heading/body fonts, upload + grid of brand assets (click inserts to canvas, same as uploads).
- **Portability:** Backup tab must export/import brands + brand assets (no accounts — this IS the persistence story).
- **Help tab** entry + regenerate help screenshots (`scripts/help-shots.mjs`) per working agreement.

## v1 non-goals (cut — overkill for OSS v1)
Multiple palettes per brand (multiple brands covers it), brand voice/guidelines, brand templates, team controls/locking, "apply brand to design" auto-restyle, logo type distinctions (a logo is just a tagged asset).

## Suggested empty state (presets-over-search principle)
Brand tab never opens blank: show a starter palette pulled from the current design's colors ("Start from this design") + a "New brand" button — one click gives a populated brand to edit.

## Build order (one Codex brief each, tests green throughout)
1. **Core model + store** (`library/brands.ts` + zustand wiring): CRUD, active brand, localStorage persistence, unit tests. Asset tagging in uploads.ts.
2. **Brand tab UI** in LeftSidebar (manage brands, palette editor, font pickers, asset grid w/ insert).
3. **Picker surfacing**: ColorSwatch brand row (+ sweep for non-ColorSwatch pickers), font-picker brand section.
4. **Backup + Help**: export/import brands in Backup tab, help content + screenshots.

## Process (per STATUS.md working agreements)
Codex implements (now able to run the Playwright-WebKit harness itself — `codex exec --dangerously-bypass-approvals-and-sandbox` is allowlisted in `.claude/settings.local.json`; use `--full-auto` for non-harness runs). Claude orchestrates + reviews diff/evidence. WebKit verification per memory `webkit-verify-protocol` (positive-case asserts; harness scripts must route into the editor via `page.click("[data-preset-id]")` → wait `.yz-canvas` before driving `__editor`). `pnpm -r build` before any harness/tauri run; fingerprint the .app before handoff.
