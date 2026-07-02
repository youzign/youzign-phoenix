# Youzign OSS — Status & Working Agreements
*Updated 2026-07-02 midday. This file is the handoff spine for the dedicated Youzign chat — read it plus `dezygn-v3/docs/fable/youzign-resurrection.md` (the decision doc) before any work.*

## State
- **M1 ✅** parser + renderer (2017 designs render; byte-stable round-trip). **M2 ✅** clipart SVG recoloring (legacy Layer-band semantics). **M3 ✅** editor v0 on branch `feat/editor-milestone-3` — Figma-style shell, select/drag/resize/rotate, inline text edit, shapes tab, undo/redo, autosave, XML/PNG export. 25/25 tests. `pnpm dev` → :5191.
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
4. Editor v0.2: fix the X/Y directive above; multi-select; group-child selection; font picker; fidelity items (shadows, blur, borders, crop, curved text).
5. Golden-image pixel-diff harness (needs a ~1,000-row designstring export from prod DB when accessible).
6. Library sidebar v1 (per §4b) → Generate panel (fal BYOK first).
7. Tauri wrap + local files + archive importer.

## Delegation policy
Codex 5.5 (`codex exec` via Bash, or the codex plugin subagents once installed) for mechanical build work; Sonnet for research; keep Claude judgment for fidelity semantics and product calls. Commit in logical chunks on feature branches; tests must stay green; update README fidelity table each milestone.
