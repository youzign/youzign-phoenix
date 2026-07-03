# Youzign OSS Feature Reference
Internal reference for the open-source editor rebuild. Audience: maintainers and
future contributors. This is an implementation map, not product copy.
## Overview table
| Area | Feature | User-facing behavior | Primary files |
| --- | --- | --- | --- |
| Canvas & manipulation | Selection | Click selects a top-level item; Shift-click toggles selection; click empty canvas clears selection. | `apps/editor/src/components/CanvasStage.tsx`, `packages/editor-core/src/selection.ts` |
| Canvas & manipulation | Marquee multi-select | Drag from empty canvas to select every top-level item intersecting the marquee. | `apps/editor/src/components/CanvasStage.tsx`, `packages/editor-core/src/geometry.ts` |
| Canvas & manipulation | Multi-item move | Drag a selected item to move the whole current selection as a block. | `apps/editor/src/components/CanvasStage.tsx`, `packages/editor-core/src/snapping.ts` |
| Canvas & manipulation | Group drill selection | Double-click a group to select a child; Escape returns selection to the parent group. | `apps/editor/src/components/CanvasStage.tsx`, `apps/editor/src/store.ts` |
| Canvas & manipulation | Direct move | Drag an unlocked item or selection to update item position. | `apps/editor/src/components/CanvasStage.tsx`, `apps/editor/src/store.ts` |
| Canvas & manipulation | Resize handles | Corner handles resize proportionally by default; Shift unlocks free corner resize. Edge handles stretch non-image items. | `apps/editor/src/components/CanvasStage.tsx`, `packages/editor-core/src/transform.ts` |
| Canvas & manipulation | Image edge crop | Drag image edge handles inward to destructively crop from that edge. | `apps/editor/src/components/CanvasStage.tsx`, `packages/editor-core/src/transform.ts`, `packages/editor-core/src/mutations.ts` |
| Canvas & manipulation | Rotate handles | Rotate selected top-level items with a handle, HUD, default 45-degree snap, Shift 15-degree step, Ctrl/Cmd fine mode. | `apps/editor/src/components/CanvasStage.tsx`, `packages/editor-core/src/transform.ts` |
| Canvas & manipulation | Smart snap guides | Dragging snaps to canvas, item, and optional grid targets; Alt/Option disables snapping while held. | `apps/editor/src/components/CanvasStage.tsx`, `packages/editor-core/src/snapping.ts` |
| Canvas & manipulation | Grid overlay | Toggle an 8 px minor / 64 px major grid; when visible, grid lines participate in snapping. | `apps/editor/src/components/CanvasStage.tsx`, `apps/editor/src/App.tsx` |
| Canvas & manipulation | Zoom | Top bar zooms canvas preview between 10% and 200%. | `apps/editor/src/components/TopBar.tsx`, `apps/editor/src/store.ts` |
| Canvas & manipulation | Undo/redo | Every committed mutation and gesture can be undone/redone in memory. | `apps/editor/src/store.ts`, `apps/editor/src/App.tsx` |
| Items & properties | Width/height | Non-text geometric items expose W/H controls; text uses font size instead. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/editor-core/src/mutations.ts` |
| Items & properties | Rotation/opacity | Selected geometric items expose angle and opacity controls. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/editor-core/src/mutations.ts` |
| Items & properties | Fill color | Text and clipart expose Fill; parametric shapes can also be set to no fill. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/editor-core/src/mutations.ts` |
| Items & properties | Flip horizontal/vertical | Selected geometric items can toggle `hFlip` and `vFlip`. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/renderer/src/items.tsx` |
| Items & properties | Center on canvas | Selected items can center horizontally or vertically on the current canvas. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/editor-core/src/arrange.ts` |
| Items & properties | Z-order controls | Bring/send to front/back and one-step forward/backward are available. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/editor-core/src/arrange.ts` |
| Items & properties | Duplicate/delete | Duplicate and delete selected unlocked items. | `apps/editor/src/components/PropertiesPanel.tsx`, `apps/editor/src/store.ts` |
| Items & properties | Layer list | Right panel lists top-level layers, supports selection, lock toggles, and drag reorder. | `apps/editor/src/components/LayersPanel.tsx`, `apps/editor/src/store.ts` |
| Items & properties | Session locks | Locked items remain selectable but cannot be moved, resized, rotated, or deleted. | `apps/editor/src/components/LayersPanel.tsx`, `apps/editor/src/components/CanvasStage.tsx`, `apps/editor/src/store.ts` |
| Items & properties | Blend modes | Items expose 16 legacy/CSS blend modes. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/renderer/src/effects.ts` |
| Items & properties | Invert | Items expose invert toggle and intensity percentage. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/renderer/src/effects.ts` |
| Items & properties | Shadow | Items expose legacy shadow enable, color, opacity, distance, and angle. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/renderer/src/effects.ts` |
| Items & properties | Border | Items expose legacy border enable, color, and width. Text uses outline shadows; non-text uses filter shadows. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/renderer/src/effects.ts` |
| Items & properties | Blur | Items expose legacy blur enable and amount. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/renderer/src/effects.ts` |
| Items & properties | Image corner radius | Images expose uniform and per-corner radius controls. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/renderer/src/effects.ts` |
| Text | Inline edit | Double-click text to edit content in place; Enter commits, Shift+Enter inserts a line, Escape cancels to previous content. | `apps/editor/src/components/CanvasStage.tsx`, `apps/editor/src/store.ts` |
| Text | Add text box | Text tab inserts default text at canvas center. | `apps/editor/src/components/LeftSidebar.tsx`, `packages/editor-core/src/mutations.ts` |
| Text | Text presets | Text tab inserts heading, subheading, body, caption, and quote presets. | `apps/editor/src/components/LeftSidebar.tsx`, `packages/editor-core/src/mutations.ts` |
| Text | Font picker | Properties panel provides searchable Google font picker and loads selected families. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/editor-core/src/fonts.ts` |
| Text | Font search insert | Text tab searches the curated Google font list and inserts a text box in that family. | `apps/editor/src/components/LeftSidebar.tsx`, `packages/editor-core/src/fonts.ts` |
| Text | Font combinations | Text tab inserts 14 pre-styled multi-layer font combinations. | `apps/editor/src/components/LeftSidebar.tsx`, `packages/editor-core/src/text-combos.ts` |
| Text | Text style toggles | Bold, italic, underline, strikethrough, and alignment are editable. | `apps/editor/src/components/PropertiesPanel.tsx`, `apps/editor/src/App.tsx` |
| Text | Text effects | Effect chips map to legacy attrs: None, Outline, Neon, Sticker, Hard shadow, Echo. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/editor-core/src/text-effects.ts` |
| Text | Curved text | Existing `text-curved` items expose a curve slider backed by radius/angle attrs. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/editor-core/src/mutations.ts`, `packages/renderer/src/items.tsx` |
| Library & content | Parametric shapes | Elements tab inserts rect, ellipse, triangle, star, arrow, and line as inline SVG clipart. | `apps/editor/src/components/LeftSidebar.tsx`, `packages/editor-core/src/shapes.ts` |
| Library & content | Styled shapes | Elements tab inserts card, circle, and divider presets. | `apps/editor/src/components/LeftSidebar.tsx`, `packages/editor-core/src/mutations.ts` |
| Library & content | Multi-layer combos | Elements tab inserts ribbon, badge, button, and quote-card combos. | `apps/editor/src/components/LeftSidebar.tsx`, `packages/editor-core/src/mutations.ts` |
| Library & content | Iconify icons | Icons tab searches Iconify color and line styles with category chips. | `apps/editor/src/components/LeftSidebar.tsx`, `apps/editor/src/library/iconify.ts` |
| Library & content | Unsplash photos | Photos tab shows featured/search results, category chips, load more, and insert-to-canvas. | `apps/editor/src/components/LeftSidebar.tsx`, `apps/editor/src/library/photos.ts` |
| Library & content | My uploads | Uploads accept PNG, JPG, WEBP, SVG, persist in IndexedDB, and insert as image items. | `apps/editor/src/components/LeftSidebar.tsx`, `apps/editor/src/library/uploads.ts` |
| Library & content | Canvas file drop | Dropping image files directly on the canvas uploads and inserts them near the cursor. | `apps/editor/src/components/CanvasStage.tsx`, `apps/editor/src/library/uploads.ts` |
| AI & Magic | fal key storage | Create panel stores a fal.ai key in browser localStorage; it is never serialized. | `apps/editor/src/components/LeftSidebar.tsx`, `apps/editor/src/library/settings.ts` |
| AI & Magic | Text-to-image | Create/Generate sends prompt and aspect preset to `fal-ai/flux/schnell`. | `apps/editor/src/components/LeftSidebar.tsx`, `apps/editor/src/library/generate.ts` |
| AI & Magic | Image edit | Create/Edit sends prompt plus up to 10 reference images to `google/nano-banana-2-lite/edit`. | `apps/editor/src/components/LeftSidebar.tsx`, `apps/editor/src/library/generate.ts` |
| AI & Magic | Background removal | Image panel runs U2-Netp ONNX locally and replaces the image source with a PNG cutout. | `apps/editor/src/components/PropertiesPanel.tsx`, `apps/editor/src/bg/removeBackground.ts`, `apps/editor/src/bg/worker.ts` |
| AI & Magic | Magic Eraser | Brush mask over an image; fal `fal-ai/bria/eraser` fills the region and replaces the source. | `apps/editor/src/components/PropertiesPanel.tsx`, `apps/editor/src/components/CanvasStage.tsx`, `apps/editor/src/magic/endpoints.ts` |
| AI & Magic | Magic Edit | Brush mask over an image, enter a replacement prompt, and fal `fal-ai/flux-pro/v1/fill` inpaints the region into the same source. | `apps/editor/src/components/PropertiesPanel.tsx`, `apps/editor/src/components/CanvasStage.tsx`, `apps/editor/src/magic/endpoints.ts` |
| AI & Magic | Magic Grab | Click a subject; fal SAM2 segments, local raster extracts it, bria erases the original, and a new image layer is added. | `apps/editor/src/components/PropertiesPanel.tsx`, `apps/editor/src/magic/endpoints.ts`, `apps/editor/src/magic/raster.ts` |
| AI & Magic | Magic Expand | Outpaint an image with ratio chips and replace the source with a larger centered image, clearing crop memory. | `apps/editor/src/components/PropertiesPanel.tsx`, `apps/editor/src/magic/endpoints.ts`, `apps/editor/src/store.ts` |
| AI & Magic | Upscale/Enhance | Send a capped image source to fal `fal-ai/clarity-upscaler`, replace the high-resolution source, and keep canvas W/H unchanged. | `apps/editor/src/components/PropertiesPanel.tsx`, `apps/editor/src/magic/endpoints.ts`, `apps/editor/src/magic/raster.ts` |
| AI & Magic | Magic Blur | Local U2-Netp cutout plus browser canvas blur creates a live preview, then bakes on Apply. | `apps/editor/src/components/PropertiesPanel.tsx`, `apps/editor/src/magic/raster.ts` |
| Backgrounds & pages | Canvas resize | Resize menu offers modern presets and custom W/H. | `apps/editor/src/components/ResizeMenu.tsx`, `packages/editor-core/src/canvas-presets.ts` |
| Backgrounds & pages | Smart resize | Optional scale-to-fit mode scales content uniformly and recenters it. | `apps/editor/src/components/ResizeMenu.tsx`, `packages/editor-core/src/resize.ts` |
| Backgrounds & pages | Solid background | Canvas panel edits `bg_color` and `bg_type=color`. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/editor-core/src/background.ts` |
| Backgrounds & pages | Gradient background | Canvas panel exposes 25 legacy gradient presets, linear/radial mode, angle, stop colors, and reverse. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/editor-core/src/background.ts`, `packages/renderer/src/background.ts` |
| Backgrounds & pages | Transparent canvas | Canvas panel toggles `transparent`; stage shows checkerboard. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/editor-core/src/background.ts` |
| Backgrounds & pages | Canvas border | Canvas panel edits border width and color. | `apps/editor/src/components/PropertiesPanel.tsx`, `packages/editor-core/src/background.ts`, `packages/renderer/src/DesignCanvas.tsx` |
| Backgrounds & pages | Canvas filters | Legacy filter items render canvas-wide CSS/filter overlay recipes. | `packages/renderer/src/DesignCanvas.tsx`, `packages/renderer/src/filters.ts` |
| Backgrounds & pages | Multi-page documents | App-level documents contain ordered single-canvas designs, with bottom thumbnails, duplicate/delete/add, drag reorder, PageUp/PageDown, whole-document undo, and document autosave. | `apps/editor/src/store.ts`, `apps/editor/src/document.ts`, `apps/editor/src/components/PageStrip.tsx` |
| Import-export & persistence | Fixture loader | Top bar loads committed XML fixtures into editor state. | `apps/editor/src/App.tsx`, `apps/editor/src/components/TopBar.tsx` |
| Import-export & persistence | XML import | Top bar imports local `.xml` designstrings. | `apps/editor/src/components/TopBar.tsx`, `packages/designstring` |
| Import-export & persistence | XML export | Top bar serializes current designstring to XML. | `apps/editor/src/components/TopBar.tsx`, `packages/designstring` |
| Import-export & persistence | PNG/JPG/PDF export | Export menu captures `.yz-canvas` as PNG/JPG, active-page XML remains unchanged, multi-page PNG/JPG download sequential files, and multi-page PDF exports one PDF page per canvas. | `apps/editor/src/components/ExportMenu.tsx`, `apps/editor/src/export/runExport.ts` |
| Import-export & persistence | Export options | Export menu supports PNG transparency, PNG/JPG 1x-5x scale, JPG quality 0.95, and local export prefs. | `apps/editor/src/components/ExportMenu.tsx`, `apps/editor/src/export/exportMath.ts` |
| Import-export & persistence | Autosave | Store persists serialized XML per design name in localStorage after commits. | `apps/editor/src/store.ts` |
| Keyboard shortcuts | Global shortcuts | App-level shortcuts cover undo/redo, duplicate, text style, delete, escape, grid, and nudging. | `apps/editor/src/App.tsx` |
| Keyboard shortcuts | Mode shortcuts | Canvas mode handlers cover crop, magic erase/grab/blur, inline text, and popovers. | `apps/editor/src/components/CanvasStage.tsx`, `apps/editor/src/components/ExportMenu.tsx`, `apps/editor/src/components/ResizeMenu.tsx` |
## Canvas & manipulation
### Selection
Selection is UID-based and local to the editor session. Items are tagged with
non-serialized `_uid` values on load, insert, and clone; `selectedUids` is store
state only and never appears in XML. Single selection, Shift-click toggle, and
empty-canvas clear live in `apps/editor/src/components/CanvasStage.tsx`; the pure
selection helpers live in `packages/editor-core/src/selection.ts`.
Known limitations: selection only has top-level hit areas unless the user drills
into a group. Multi-selection can be moved and deleted, but the combined box has
no multi-resize handles.
### Marquee multi-select
Dragging from the empty canvas draws a marquee and selects top-level non-filter
items whose boxes intersect it. The hit test uses `itemBox` and
`boxIntersectsRect` from `packages/editor-core/src/geometry.ts`. This is session
only; the resulting selection is not serialized.
Known limitations: marquee does not descend into group children, and filter
items are deliberately ignored.
### Group drill selection
Double-clicking a group selects the topmost child under the cursor. The store
records `drillGroupUid` so Escape can pop back to the parent group instead of
clearing selection. No XML attribute is written for drill state.
Known limitations: the implementation only searches one nested level in
`CanvasStage.locate`, matching the current renderer/editor group support.
### Move, resize, rotate
Move gestures call `beginHistory`, live-patch geometry during pointer movement,
then `endGesture` persists one undo step. Resize math is in
`packages/editor-core/src/transform.ts`: corner handles pin the opposite corner;
edge handles pin the opposite edge. For corners, aspect ratio is locked by
default and Shift unlocks free resize.
Rotation uses `snapRotation`: default auto-snap to 45-degree guides within a
small threshold, Shift quantizes to 15 degrees, and Ctrl/Cmd bypasses snapping.
The written legacy attrs are `xpos`, `ypos`, `width`, `height`, and `rotation`
through `patchItem`.
Known limitations: top-level text does not show resize handles because text
geometry is governed by legacy Flash text metrics; use font size instead.
### Image edge crop
For image selections, side handles crop instead of stretching. The crop rect is
axis-aligned in canvas coordinates, mapped to source pixels with `computeCrop`,
drawn into a canvas, and committed as a new PNG data URI. The item writes
`source`, `xpos`, `ypos`, `width`, `height`, and `cropped="true"`.
This matches the legacy designstring model: there is no serialized crop rect.
The baked source is the source of truth. Known limitation: cross-origin images
that taint the browser canvas cannot be baked, so the crop silently does not
commit.
### Smart guides and grid
Dragging computes target lines from the canvas edges/center, other top-level
item AABBs, and grid lines when grid is visible. `resolveSnap` applies a canvas
unit threshold and hysteresis so the guide stays engaged until it drifts beyond
the release distance. Alt/Option disables snapping during the drag.
Grid visibility is `showGrid` store state only. It renders an 8 px minor and
64 px major overlay and is not serialized.
### Zoom
Zoom is a preview-only transform stored as `zoom` in Zustand. It affects the
stage wrapper and interaction math but does not write designstring attrs.
Known limitation: zoom is not persisted with the document.
### Undo/redo
The store keeps `past` and `future` stacks of structured-cloned `Design`
snapshots. Commit-level mutations push one history entry; live gestures are
coalesced into one entry. Undo/redo persists the restored serialized XML back to
the current localStorage slot.
Known limitations: history is unbounded, matching the gap-analysis note that
legacy had a nominal limit but did not enforce it. History is session-only and
is cleared on fixture/import load.
## Items & properties
### Geometry and basic item controls
The Properties panel writes item geometry and presentation through
`patchSelected`, which delegates to `patchItem`. Numeric legacy attrs include
`width`, `height`, `rotation`, `opacity`, `xpos`, `ypos`, and `index`.
Position fields are intentionally not exposed in the UI per Bertrand's directive:
position is direct manipulation only.
Known limitations: text exposes angle/opacity/font size but not W/H controls.
Groups expose top-level properties but not full group editing beyond drill
selection.
### Fill and no fill
Text recolor writes the legacy `color` glyph array and clears `isNoFill`.
Parametric shapes are clipart with `shape_kind` and `shape_fill`; recoloring
regenerates the inline SVG `source`. No-fill stores `shape_fill="none"` and an
inline SVG with `fill="none"`.
Generic SVG clipart recolor writes the `color` attr array. Color Iconify icons
are inserted with `recolorable=false`, so their designed fills remain intact.
Known limitations: recoloring text collapses per-glyph colors to a uniform
array by design. Multi-band SVG recoloring currently collapses to the first
color in the editor path.
### Arrange, z-order, duplicate, delete
Flip toggles write `hFlip` and `vFlip`. Center writes either `xpos` or `ypos` to
the canvas midpoint. Bring-to-front/send-to-back assign new `index` values at
the extremes; one-step forward/backward swaps index values with neighboring
items; layer drag reorder reuses the existing index multiset.
Duplicate uses `cloneItemForDuplicate`, creates new `_uid` values, offsets the
clone, and preserves serializable attrs. Delete skips locked items.
Known limitations: z-order and layers panel operate on top-level design items,
not children inside a drilled group.
### Layers and locks
The Layers panel lists top-level non-filter items sorted top-of-stack first,
supports click selection, modifier toggle selection, drag reorder, and lock
buttons. Locks live in `lockedUids` only. They block move, resize, rotate, and
delete, but the item remains selectable.
Known limitation: locks are deliberately not serialized because legacy XML has
no `isLocked` attr.
### Effects
The Effects section writes only legacy attrs. Blend mode writes `blendMode` and
renders as CSS `mix-blend-mode`. Invert writes `isInvert` and `invertIntensity`
and renders as CSS `invert(<percent>%)`.
Shadow writes `is_shadow`, `shadow_distance`, `shadow_angle`, `shadow_color`,
and `shadow_opacity`; the renderer uses `drop-shadow(cos(angle)*distance,
sin(angle)*distance, 10px, rgba(color, opacity))`. Blur writes `is_blur` and
`blur_size`; renderer uses `blur(blur_size / 2)`.
Border writes `is_border`, `border_size`, and `border_color`. Non-text border
renders as eight drop-shadows; text border renders as a text-shadow outline
ring. This deliberately uses the intended symmetric outline, not the legacy
non-text typo called out in status notes.
Known limitations: CSS filter composition can differ slightly from the Flash-era
runtime in browser-specific edge cases.
### Image corner radius
Image radius controls write `isCornerRadiusIndividual` and
`inputCornerTopLeft`, `inputCornerTopRight`, `inputCornerBottomLeft`,
`inputCornerBottomRight`. The renderer maps those values to CSS
`border-radius` in top-left, top-right, bottom-right, bottom-left order.
Known limitation: radius is image-only in the UI.
## Text
### Text creation and inline editing
The Text tab inserts `text` items using `createTextItem`, defaulting to Arvo,
`fontType="External Font"`, centered alignment, `scaleUsed="true"`, and legacy
text-area/mc metrics. Double-click editing overlays a contentEditable control
and commits by writing `content` only; the raw attr bag is otherwise unchanged.
Known limitations: multi-line editing is possible with Shift+Enter in the
contentEditable, but the renderer still vertically centers using the stored
single-line `textAreaHeight` assumptions.
### Fonts
The app preloads fonts used by the current design and loads searched/selected
Google families with `ensureGoogleFonts`. Font changes write `font` and
`fontType` through `fontPatch`. The available list is curated in
`packages/editor-core/src/fonts.ts`.
Known limitations: custom uploaded fonts are not implemented. The curated
Google list is smaller than the legacy full catalog.
### Text styling
Bold, italic, underline, strikethrough, and alignment write the legacy attrs
`bold`, `italic`, `underline`, `strikethrough`, and `alignment`. Keyboard
shortcuts cover bold, italic, and underline when a text item is selected and the
user is not typing.
Known limitation: there is no shortcut for strikethrough.
### Text effects and font combinations
Text effects intentionally compose only existing legacy attrs: border, shadow,
and `isNoFill`. Offered chips are None, Outline, Neon, Sticker, Hard shadow,
and Echo. Effects that require new serialized schema, like CSS-only glitch or
background blocks, are not offered.
Font combinations are data-driven in `text-combos.ts`. Each combo inserts one
or two text layers at canvas center, applies optional text effects through the
same legacy attr path, and selects the inserted layers.
Known limitation: combo layers are independent text items, not a serialized
group.
### Curved text
The renderer supports `text-curved` through SVG `textPath`, deriving the arc
from legacy `radius`, `start_angle`, `end_angle`, and `top_direction`. The
Properties panel exposes a -100..100 curve slider that writes those attrs via
`setCurve`.
Known limitation: new curved text is not a separate insertion control; the UI
edits existing `text-curved` items. Legacy TS editor did not render curved text,
but Flash did; this implementation reconstructs the attr semantics.
## Library & content
### Elements
Primitive shapes are stored as `clipart` nodes with inline SVG data URIs,
`shape_kind`, and `shape_fill`. The six primitives are rect, ellipse, triangle,
star, arrow, and line. Styled shapes layer presets on the same factories by
setting fill, border, shadow, and size.
Combos insert multiple items, not serialized groups. Current combo ids include
ribbon-text, badge, button, and quote-card, implemented by editor-core item
factories and selected together after insertion.
Known limitations: no frames, grids, tables, or charts yet.
### Icons
Iconify search calls `https://api.iconify.design/search` with style-specific
prefix filters. Line icons insert as recolorable SVG clipart URLs. Color icons
use designed multi-color prefixes and are inserted non-recolorable to preserve
their native fills.
Known limitations: search requires network access. SVG fetch/render errors fall
back to a bounded placeholder in the renderer.
### Photos and uploads
Unsplash uses the built-in access key unless a localStorage override exists.
Featured photos call `/photos?order_by=popular`; search calls `/search/photos`.
On insert, the editor pings the Unsplash download tracking endpoint and stores
attribution on the item as `_attribution`, which is session-only.
My uploads use IndexedDB database `youzign-next`, object store `uploads`.
Accepted types are PNG, JPG/JPEG, WEBP, and SVG. Raster uploads are downscaled
to a max longest side of 2400 px; SVGs pass through as data URIs. Inserted image
items serialize the data URI as `source`.
Known limitations: attribution and upload library records are not serialized in
the XML. IndexedDB availability depends on the browser.
## AI & Magic
### fal.ai key and Create panel
The fal key is stored in localStorage through `library/settings.ts` and is never
bundled or serialized. The Create panel has two modes: Generate and Edit. The
Dezygn credits bridge is a stub card only.
Known limitation: all fal features depend on the user's browser being allowed to
reach `https://fal.run` and on the user's BYOK key.
### Text-to-image
Generate mode posts to `https://fal.run/fal-ai/flux/schnell` with a prompt,
one image, safety checker enabled, and one of three aspect presets: square
1024x1024, landscape 1344x768, or portrait 768x1344. Results are session
history in component state; clicking one inserts it as an image item with
provider attribution `fal.ai`.
Cost profile: API-paid by the user's fal key. No local model cost.
Known limitation: live fal generation was noted as not exercised on one machine
in `docs/STATUS.md`; source supports the flow and handles fal/network errors.
### Image-to-image edit
Edit mode posts to `https://fal.run/google/nano-banana-2-lite/edit` with a
prompt and `image_urls`, capped at 10 references. References can come from file
upload, My uploads, or the selected canvas image; base64 data URIs are sent
directly.
Cost profile: API-paid by the user's fal key. Uploads/canvas references are
local until submitted.
Known limitation: the edit result inserts as a new image; it does not replace
the selected image automatically.
### Background removal
Remove bg runs fully local U2-Netp through `onnxruntime-web` in
`apps/editor/src/bg/worker.ts`, fetching `/models/u2netp.onnx` once. The worker
uses WASM because WebGPU has a noted MaxPool ceil-mode issue for this model.
The output is a PNG data URI with alpha, written back to the image `source`.
Cost profile: local CPU/WASM after model download; no API cost.
Known limitations: model download is about 4.5 MB, browser memory/performance
varies, and the operation destructively replaces image pixels.
### Magic Eraser
Magic Eraser collects brush strokes in canvas units, rasterizes a mask at the
source image's native resolution, sends source plus mask to `fal-ai/bria/eraser`,
downloads the result, converts it to a data URI, and writes it to `source`.
Cost profile: fal API call plus local mask rasterization and result download.
Known limitations: it requires a fal key. The source is destructively replaced;
there is no separate serialized mask.
### Magic Edit
Magic Edit reuses the eraser brush overlay but requires a replacement prompt.
The mask is rasterized at the source image's native resolution and posted with
the prompt to `fal-ai/flux-pro/v1/fill`. The result is downloaded, converted to
a data URI, and written through the same `applySource` path as eraser so undo
restores the prior source.
Cost profile: one fal inpaint call plus local mask rasterization.
Known limitations: it requires a fal key and a non-empty prompt. The source is
destructively replaced; there is no separate serialized mask or prompt.
### Magic Grab
Magic Grab sends a point prompt to `fal-ai/sam2/image`, uses local raster code to
extract the subject from the returned mask, then calls `fal-ai/bria/eraser` to
hole-fill the original. The original image source is replaced with the erased
PNG, and a new image item containing the extracted subject is pushed and
selected.
Cost profile: two fal API calls plus local raster extraction.
Known limitations: if the eraser/fill step fails, the lift is aborted so the
user does not get a duplicated subject over an intact original.
### Magic Expand
Magic Expand plans a larger outpaint canvas around the source image using ratio
chips: 1:1, 4:5, 16:9, 9:16, or Free for the current canvas ratio. It posts the
source plus canvas size and original image placement to `fal-ai/bria/expand`.
The returned image replaces the source, the item grows by the returned natural
dimension scale, remains centered on the old position, and is clamped to the
canvas. Crop memory is cleared because the image content changed.
Cost profile: one fal outpaint call.
Known limitation: it requires a fal key. Rotated image boxes use the same
axis-aligned geometry path as other source replacement tools.
### Upscale/Enhance
Upscale/Enhance caps the submitted source to a 2048 px longest side, posts it to
`fal-ai/clarity-upscaler`, downloads the result as a data URI, and writes it
through `applySource`. The canvas item width and height are unchanged, so the
image simply becomes sharper in place. A short confirmation appears after the
source swap.
Cost profile: one fal upscale call plus optional local downscale before upload.
Known limitation: it requires a fal key and depends on the browser being able to
read the selected image into a canvas when downscaling is needed.
### Magic Blur
Magic Blur is local. It computes a subject cutout through the same U2-Netp
background-removal path, then uses browser canvas compositing to blur the
background while keeping the subject sharp. The preview is `blurPreview` store
state; Apply writes the composed PNG to `source`, while Escape/Cancel discards
it.
Cost profile: local model inference plus canvas work; no API cost.
Known limitation: preview is non-serialized until applied.
## Backgrounds & pages
### Canvas resize and smart resize
The Resize menu exposes a 2026 preset catalog grouped into Social, Video, Print,
and Web, plus custom width/height clamped to 32..8000 px. Presets can stamp
`dpi` where supplied. Canvas size writes `canvas_width` and `canvas_height`.
With "Scale elements to fit" enabled, `resizeDesign` applies a uniform scale
factor `min(newW/oldW, newH/oldH)`, scales item positions, sizes, text metrics,
font size, shadow distance, border size, blur size, curved-text radius, and group
scale, then recenters the content block. With it disabled, only canvas dimensions
change.
Canvas resize applies to the active page only in multi-page documents.
### Background editor
When nothing is selected, the right panel edits the canvas. Solid background
writes `bg_type="color"`, `bg_color`, and clears `transparent`. Transparent
writes `transparent`. Canvas border writes `border_width` and `border_color`.
Gradient support uses the 25 legacy presets from
`PanelBackgroundGradient.ts`, writes `bg_type="gradient"`, `grad1`, `grad2`,
`is_linear`, `angle`, `ratio1`, `ratio2`, and `is_reverse`, and renders through
`packages/renderer/src/background.ts`. Legacy gradient angle mapping is preserved
by `gradientCssDeg`.
Known limitations: pattern and background image bg types fall back to solid
`bg_color` in the renderer.
### Canvas filters
The renderer parses legacy `<item type="filter">` nodes and applies a
canvas-wide recipe from `packages/renderer/src/filters.ts`. Supported names are
Original, Grayscale, Sepia, Vignette, Lomo, Orton, Polaroid, Retro, Vintage,
Adventure, Ignite, Blonde, Sense, Turquoise, and Cool. The filter item itself
does not render as a normal selectable item.
Known limitations: the current editor has renderer support but no right-panel
UI for adding/changing canvas filters.
### Multi-page documents
Multi-page is an editor-level document model: each page is still an unchanged
single-canvas designstring. The store exposes the active page through the
existing `design` API so selection, mutation, resize, and XML export continue to
operate on one design at a time. History snapshots cover the whole document
(`pages` plus `activePage`) so page add/delete/duplicate/reorder undo cleanly.
Autosave stores JSON with per-page XML strings and migrates old single XML
autosaves to a one-page document.

The bottom page strip renders live mini canvases, highlights the active page,
offers hover duplicate/delete controls, adds blank pages that inherit the
current page canvas/background, supports drag reorder, and collapses to a slim
add-page bar for one-page documents.
## Import-export & persistence
### XML import/export and fixtures
TopBar fixture loading calls `load(xml, name)`, which parses XML, tags UIDs, and
clears selection, modes, history, lock state, and async errors. XML import reads
a local `.xml` file and follows the same path. XML export serializes the current
design with `serialize(design)`.
Known limitations: invalid XML handling is not surfaced as a designed error
state in the current TopBar.
### Raster/PDF export
Export captures canvas nodes with `html-to-image`. PNG and JPG use pixel ratios
1..5; PDF captures high-quality JPEGs and places them full-bleed on jsPDF pages
sized in px. JPG quality is 0.95. PNG transparent export blanks the cloned
canvas background before capture.
Export preferences are localStorage under `youzign-next:export-prefs`. They are
not designstring attrs.
For multi-page documents, the export popover offers all pages, current page, or
a clamped custom range such as `1-3,5`. Multi-page PNG/JPG exports are sequential
downloads (`name-1.png`, `name-2.png`). Multi-page PDF exports one PDF with one
page per selected canvas.
### Autosave
Every store commit persists a document JSON payload to
`youzign-next:design:<designName>` in localStorage. Each page inside the JSON is
serialized with the existing designstring `serialize()` path, preserving
per-page XML byte stability. Old single XML autosaves migrate to a one-page
document. Undo/redo also persist the restored document. Uploads use IndexedDB separately; fal/Unsplash keys use
localStorage settings separately.
Known limitations: there is no My Designs gallery yet, no server save, and no
archive importer while legacy AWS assets are unavailable.
## Keyboard shortcuts
Global shortcuts are ignored while an input, textarea, contentEditable, or
inline text edit is active.
| Shortcut | Scope | Behavior | Source |
| --- | --- | --- | --- |
| Cmd/Ctrl+Z | Global | Undo. | `apps/editor/src/App.tsx` |
| Shift+Cmd/Ctrl+Z | Global | Redo. | `apps/editor/src/App.tsx` |
| Cmd/Ctrl+Y | Global | Redo. | `apps/editor/src/App.tsx` |
| Cmd/Ctrl+D | Global | Duplicate selected items. | `apps/editor/src/App.tsx` |
| Cmd/Ctrl+B | Global | Toggle bold on selected text items. | `apps/editor/src/App.tsx` |
| Cmd/Ctrl+I | Global | Toggle italic on selected text items. | `apps/editor/src/App.tsx` |
| Cmd/Ctrl+U | Global | Toggle underline on selected text items. | `apps/editor/src/App.tsx` |
| Delete | Global | Delete selected unlocked items. | `apps/editor/src/App.tsx` |
| Backspace | Global | Delete selected unlocked items. | `apps/editor/src/App.tsx` |
| Escape | Global | If drilled into a group, select parent group; otherwise clear selection. | `apps/editor/src/App.tsx`, `apps/editor/src/store.ts` |
| G | Global | Toggle grid. | `apps/editor/src/App.tsx` |
| ArrowLeft/Right/Up/Down | Global | Nudge selected items by 1 px. | `apps/editor/src/App.tsx` |
| Shift+ArrowLeft/Right/Up/Down | Global | Nudge selected items by 10 px. | `apps/editor/src/App.tsx` |
| Shift-click item | Canvas | Toggle item in selection. | `apps/editor/src/components/CanvasStage.tsx` |
| Double-click text | Canvas | Enter inline text editing. | `apps/editor/src/components/CanvasStage.tsx` |
| Double-click image | Canvas | Enter crop mode. | `apps/editor/src/components/CanvasStage.tsx` |
| Double-click group | Canvas | Drill into child selection. | `apps/editor/src/components/CanvasStage.tsx` |
| Shift while corner-resizing | Canvas gesture | Break default proportional resize. | `apps/editor/src/components/CanvasStage.tsx` |
| Alt/Option while moving | Canvas gesture | Temporarily disable smart snapping. | `apps/editor/src/components/CanvasStage.tsx` |
| Shift while rotating | Canvas gesture | Quantize rotation to 15-degree increments. | `apps/editor/src/components/CanvasStage.tsx` |
| Ctrl/Cmd while rotating | Canvas gesture | Fine rotate with no snapping. | `apps/editor/src/components/CanvasStage.tsx` |
| Enter | Crop mode | Apply destructive crop. | `apps/editor/src/components/CanvasStage.tsx` |
| Escape | Crop mode | Cancel crop. | `apps/editor/src/components/CanvasStage.tsx` |
| Escape | Image edge-crop drag | Cancel the in-progress edge crop drag. | `apps/editor/src/components/CanvasStage.tsx` |
| Enter | Magic Eraser overlay | Apply brush mask. | `apps/editor/src/components/CanvasStage.tsx` |
| Escape | Magic Eraser overlay | Cancel eraser mode. | `apps/editor/src/components/CanvasStage.tsx` |
| Enter | Magic Edit overlay | Apply brush mask and prompt when the prompt is non-empty. | `apps/editor/src/components/CanvasStage.tsx` |
| Escape | Magic Edit overlay | Cancel edit mode. | `apps/editor/src/components/CanvasStage.tsx` |
| Escape | Magic Grab overlay | Cancel grab mode. | `apps/editor/src/components/CanvasStage.tsx` |
| Enter | Magic Blur preview | Bake preview into image source. | `apps/editor/src/components/CanvasStage.tsx` |
| Escape | Magic Blur preview | Cancel preview without writing XML. | `apps/editor/src/components/CanvasStage.tsx` |
| Enter | Inline text edit | Commit text and exit, unless Shift is held. | `apps/editor/src/components/CanvasStage.tsx` |
| Shift+Enter | Inline text edit | Insert newline/contentEditable default. | `apps/editor/src/components/CanvasStage.tsx` |
| Escape | Inline text edit | Restore previous content and exit. | `apps/editor/src/components/CanvasStage.tsx` |
| Enter | fal key field | Save fal key. | `apps/editor/src/components/LeftSidebar.tsx` |
| Cmd/Ctrl+Enter | Create prompt | Run text-to-image generation. | `apps/editor/src/components/LeftSidebar.tsx` |
| Cmd/Ctrl+Enter | Edit prompt | Run image edit generation. | `apps/editor/src/components/LeftSidebar.tsx` |
| Escape | Export menu open | Close export popover. | `apps/editor/src/components/ExportMenu.tsx` |
| Escape | Resize menu open | Close resize popover. | `apps/editor/src/components/ResizeMenu.tsx` |
## Fidelity contract
### Byte-stability rules
The core contract is that parsing and serializing an untouched legacy
designstring must be byte-stable, and ordinary edits should touch only the
serialized attrs for the item or canvas property being changed. The designstring
package owns raw attr preservation: every parsed node keeps a raw attr bag and
attr order so unknown attrs survive round-trip.
Editor mutations must write both the typed field and the raw attr. Item edits go
through `patchItem`, `setTextColor`, `setShapeFill`, `setShapeNoFill`,
`setCurve`, `applyCrop`, or `applySource`. Canvas edits go through
`packages/editor-core/src/background.ts` and `resize.ts`. Direct mutation that
does not sync raw attrs is a bug.
Session-only state must not leak into XML. Current session-only fields include
`_uid`, `_attribution`, `selectedUids`, `drillGroupUid`, `editingUid`,
`croppingUid`, `lockedUids`, async processing flags, `magicMode`, `magicUid`,
`blurPreview`, zoom, grid visibility, undo/redo stacks, fal/Unsplash keys,
export prefs, and IndexedDB upload records.
New editor-only insertions must still be valid legacy-shaped items. Parametric
shapes are `clipart` nodes with inline SVG `source` plus extra attrs; uploaded,
cropped, generated, background-removed, erased, grabbed, and blurred images are
ordinary `image` nodes whose baked pixels live in `source`.
### Rendering fidelity commitments
Color conversion uses the legacy signed-int algorithm. The README calls out
spec transcription typos: `14628964` resolves to `#df3864`, `8281250` resolves
to `#7e5ca2`, and the tests assert algorithm-faithful values.
Text placement uses the Flash text matrix and legacy text-area/mc metrics. Text
per-glyph colors render as merged runs; recoloring intentionally collapses to a
uniform glyph color array. Font family reads `font`; `fontType` is kept in sync
when the UI changes fonts.
Clipart SVG rendering fetches, sanitizes/inlines, and recolors fillable paths
from legacy `Layer`/`color` semantics where possible. Non-SVG clipart falls back
through image rendering, and broken images/SVGs render bounded placeholders
instead of breaking layout.
Groups render one-level nesting with legacy center-based placement, rotation,
scale, opacity, and flips. Children are stored in group-local coordinates.
Effects mirror legacy attr semantics: shadow, blur, border, blend mode, invert,
corner radius, hFlip/vFlip, opacity, rotation, gradients, canvas borders, and
canvas filters are all rendered from existing designstring attrs.
### Deliberate divergences from legacy
The UI removes raw X/Y coordinate fields. Position is direct manipulation only;
the right panel keeps size, angle, opacity, colors, effects, and arrange
controls.
The editor exceeds legacy in several places: multi-select, marquee selection,
working crop, curved-text editing, free zoom, AI generation/editing, local
background removal, Magic Eraser/Grab/Blur, per-glyph color preservation until
explicit recolor, offline parametric shapes, snapping, grid, layers panel, and
export scale/transparent controls.
Image crop is destructive by design. Legacy never stored a crop sub-region, only
`cropped`, and the TS-era crop path was effectively a stub/background-eraser
redirect. The fidelity-correct modern representation is a baked source plus
updated geometry and `cropped="true"`.
Background removal and magic image tools also destructively replace image
pixels. They do not invent new attrs for masks, prompts, cutouts, previews, or
API provenance.
Text-curved rendering is a reconstruction of Flash-era attr semantics. The
legacy TypeScript editor did not render curved text, but the designstring attrs
exist and are rendered here with SVG text paths.
Non-text border renders the intended symmetric eight-direction outline. Status
notes call out a legacy non-text border math typo; reproducing that typo would
make the visual output worse without preserving meaningful design intent.
Modern canvas-size presets deliberately replace the 2016 preset catalog. Dead
platforms such as Google+ were removed, dimensions were updated, and smart
resize was added. The legacy resize behavior remains available by disabling
"Scale elements to fit".
Local-first OSS scope deliberately excludes marketplace, teams/share/push,
server saves, comments/collaboration, and production template/archive import
until the legacy production DB/AWS asset path is available.
