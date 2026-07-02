# Youzign OSS — Status & Working Agreements
*Updated 2026-07-02 evening. This file is the handoff spine for the dedicated Youzign chat — read it plus `dezygn-v3/docs/fable/youzign-resurrection.md` (the decision doc) before any work.*

## State
- **M1 ✅** parser + renderer (2017 designs render; byte-stable round-trip). **M2 ✅** clipart SVG recoloring (legacy Layer-band semantics). **M3 ✅** editor v0 (merged to main) — Figma-style shell, select/drag/resize/rotate, inline text edit, shapes tab, undo/redo, autosave, XML/PNG export. **v0.2 ✅** on branch `feat/editor-v0.2` — X/Y inputs removed (directive #2 done), multi-select (shift-click/marquee/combined bbox), group-child drill selection (dbl-click/Escape), searchable Google-Fonts picker (legacy font/fontType fields), legacy-faithful shadow/blur/border effects + panel controls, curved text (SVG textPath on legacy arc attrs), destructive image crop (legacy stores no crop rect — bakes new image, cropped=true). 62/62 tests. `pnpm dev` → :5191. Shots in docs/shots/editor-v0.2-*.png.
- **UI overhaul ✅** (merged) — Canva-level shell: layered dark surfaces, indigo accent, Inter, shared ui primitives (Switch/scrubbable NumberField/ColorSwatch/IconButton), designed 404 placeholder. Bertrand approved direction; nits open: "0,26" comma decimal in shadow opacity, off-state toggles read as dots. **Library sidebar v1 ✅** (merged) — Iconify icons tab (insert as recolorable clipart), Photos tab w/ Pexels/Pixabay/Unsplash BYOK adapters (localStorage keys), designed states. 73/73 tests.
- Fidelity notes: legacy TS editor never rendered text-curved (Flash did) — our render reconstructs the attribute semantics; legacy non-text border math has a typo, we render the intended symmetric 8-direction outline.
- Legacy repos cloned for reference at the session scratchpad (re-clone: github.com/youzign/{youzign-local,editor,theme}).

## Bertrand's UI directives (hard rules)
1. **No feature regressions** vs the legacy editor — before removing/changing any capability, check the legacy TS source (editor/src/) and the fidelity table in README.
2. **No invented UI**: concretely, REMOVE the X/Y coordinate input fields on/near the canvas ("really not useful, off-putting in the modern age"). Position = direct manipulation only. Properties panel keeps size/rotation/opacity/color — not raw coordinates.
3. Modern = calm: dark Figma-like, minimal chrome, direct manipulation over form fields.

## Context that shapes decisions
- **AWS is SUSPENDED (unpaid, ~$442 to restore).** All legacy S3 asset URLs 404. Reinstatement = first allocation of Monday's launch revenue; AWS retains data ~90 days post-suspension, so urgent-not-panic. Until then: build against local fixtures; the "import my archive" story waits.
- Generate panel dual fuel locked: fal.ai BYOK (OSS default) + "Connect Dezygn — use your credits" (bridge). Library plan (Iconify/Pexels-Pixabay-Unsplash adapters/parametric shapes/unDraw) in decision doc §4b.
- Before any server decommission: dump WP `wp_terms`/`wp_term_taxonomy` + `save_editor_design` (the designs!) from the 31GB prod DB.

## Milestone ladder (next)
4. ~~Editor v0.2~~ ✅ done (see State).
5. Golden-image pixel-diff harness (needs a ~1,000-row designstring export from prod DB when accessible).
6. Library sidebar v1 (per §4b) → Generate panel (fal BYOK first).
7. Tauri wrap + local files + archive importer.

## Delegation policy
Codex 5.5 (`codex exec` via Bash, or the codex plugin subagents once installed) for mechanical build work; Sonnet for research; keep Claude judgment for fidelity semantics and product calls. Commit in logical chunks on feature branches; tests must stay green; update README fidelity table each milestone.
