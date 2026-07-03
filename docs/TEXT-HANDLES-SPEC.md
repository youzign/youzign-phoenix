# Text handles — researched spec (Canva model)
*Researched 2026-07-03 (Canva Help Center + third-party guides). Owner: "research it first, don't wing it."*

## The Canva behavior (verified)
- **Side pill handles (LEFT + RIGHT only)**: drag changes the **text box width only**. Font size unchanged. Text re-wraps to the new width; box **height auto-grows/shrinks** from the wrapped content. Dragging the left handle keeps the right edge anchored (and vice versa).
- **Corner handles (4)**: proportional scale — **font size and box width scale together** (same factor). Wrap layout is preserved because width and glyph size scale in lockstep. Height follows automatically.
- **No top/bottom edge handles on text** — height is never directly editable; it's derived from content + width. (Canva shows only corners + L/R pills on text.)
- **Alignment** (L/C/R) lays out lines within the box width; a wider box with centered alignment keeps text centered. Alignment only becomes meaningful because box width is user-controllable.
- Font size can always be set exactly via the panel field (drag-scaling produces fractional sizes).

## Mapping to our model (legacy designstring)
- `size` = font size → corner-scale multiplies it.
- `textAreaWidth` (+ `mcWidth` ratio, see geometry.ts) = wrap width → side handles edit this; corner-scale multiplies it.
- Height fields (`textAreaHeight`/`mcHeight`) = recompute from measured wrap after every content/width/size/font change — never user-set.
- `xpos` compensation on left-handle drag so the right edge stays anchored (and inverse).
- Rotation: handle drags operate in the item's local axis (rotate deltas into local space like image edge-crop does).

## Interaction details
- Corner drag: proportional always (no Shift-free mode for text — matches Canva; Shift can be no-op).
- Live preview during drag; commit on release (history = one step).
- Min width: ~1 character; min font size 4.
- Inline editing (dbl-click) unchanged; on commit, re-measure height.
- Selection box must equal the measured rendered bounds (hardening batch item #7 is the prerequisite).

## Out of scope v1
- Vertical anchor (top/middle/bottom) — Canva has it in the spacing panel; later.
- Auto-shrink-to-fit modes.
