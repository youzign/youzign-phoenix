# Task 1 (do first): fix dashboard-thumbnail regression introduced by the stable-capture fix

## Context

Worktree: this repo, branch `fix/export-webkit-images`. It contains an uncommitted, verified fix
(`apps/editor/src/export/capture.ts` + changes in `runExport.ts` / `App.tsx`) for WebKit dropping
large images from exports/thumbnails. Read `docs/briefs/export-webkit-images-brief.md` for that
background if needed.

## The regression (diagnosed from the user's live IndexedDB — do not re-litigate)

`captureDashboardThumb` (apps/editor/src/App.tsx:36-55) now awaits `ensureExportImages([node])`
and `captureJpegStable(...)` (which itself inserts double-rAF + delays between attempts). If the
user navigates back to the dashboard during those awaits, the `.yz-canvas` node is unmounted.
`toJpeg` on a detached/zero-size node returns the literal string `"data:,"` (an empty data URL —
what `canvas.toDataURL()` yields for a 0×0 canvas). Two consecutive attempts both return
`"data:,"`, `captureStable` accepts them as "stable", the empty string is persisted as the
design's `thumb`, and the dashboard renders a broken-image icon. Confirmed in the user's real
database: two designs have `thumb = "data:,"` exactly. The old good thumbnail is clobbered.

## Fix requirements

1. `capture.ts`: define validity — a capture result is valid only if it matches `/^data:image\//`
   and has some minimal plausible length. `captureStable` must never return an invalid result as
   stable or as best-fallback. If NO attempt produces a valid result, throw (callers already have
   failure paths). Stop retrying early if the target node is no longer connected
   (`node.isConnected`) — pass the node (or an `isCancelled` callback) into the helpers as needed.
2. `App.tsx` `captureDashboardThumb`: re-check `node.isConnected` (and a nonzero rect) after each
   await; on any bail-out or thrown capture, return `previous?.thumb` (the existing catch already
   does this — make sure the invalid-result path lands there too, never persisting a broken thumb).
3. Result: an interrupted thumbnail capture must leave the previously stored thumb untouched.
   Reopening a design and letting it sit regenerates a good thumb (already works — don't break it).
4. Unit tests (vitest, `apps/editor/test/capture.test.ts` + a new test file if cleaner):
   - `captureStable` with a capture fn returning `"data:,"` twice → throws (never returns it).
   - Mixed: invalid, then valid V, then valid V → returns V.
   - Detached-node early-exit path.
   - A `captureDashboardThumb`-level test that a failing/invalid capture preserves `previous.thumb`
     (follow the mocking pattern in `test/export-fonts.test.ts`).
5. Regression check: `node scripts/e2e-export-webkit.mjs` must still pass (it covers the good-path
   thumbnail + export with 6 large photos in real WebKit).

# Task 2 (only after Task 1 is verified): Cmd/Ctrl+V pastes images into the editor's Photos tab

Feature spec from the owner: pressing Cmd+V (mac) / Ctrl+V with an image on the clipboard, while
in the editor, imports that image so it appears under the **Photos** tab (the uploads library) —
exactly as if the user had uploaded the file there.

Implementation requirements:
- Listen for the native `paste` event at the editor level (see where other global key handling
  lives in `EditorView` in App.tsx). Extract image items from `event.clipboardData` (both `files`
  and `items` of type `image/*`; handle multiple).
- Reuse the EXISTING upload pipeline end-to-end: `fileToUploadRecord` + the uploads store in
  `apps/editor/src/library/uploads.ts` and the flow LeftSidebar.tsx uses (search for
  `fileToUploadRecord` / `addPhoto` usage around LeftSidebar.tsx:591). The pasted image must
  appear in the Photos tab immediately (respect however that list refreshes after a normal upload).
- Do NOT hijack paste when the user is editing text: bail if the event target (or active element)
  is an input, textarea, or contenteditable, or when the editor store says text editing is active
  (`editingUid`), or when the clipboard carries no image. Never call preventDefault in those cases.
- Spec is library-only: do NOT auto-place the image on the canvas.
- Unit tests for the extraction/guard logic (extract it as a small pure function so it's testable).

# Verification (all must pass; show output)

- `pnpm --filter @youzign/editor test` — green.
- `node scripts/e2e-export-webkit.mjs` — green.
- `pnpm -r build` — clean.
- Do NOT commit. Leave changes in the working tree.

# Out of scope

Everything else. No refactors beyond what's specified, no dependency changes, match house style.

Final message must include: per-task diff summary (`git diff --stat` + a sentence per file),
test outputs proving each requirement, and any deviations with reasons.
