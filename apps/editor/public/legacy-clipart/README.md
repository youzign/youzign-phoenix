# Legacy built-in clipart (SVG)

These SVGs are the rescued vector versions of the legacy Youzign editor's
built-in cliparts, from the archived editor asset library (`youzign-archive` B2
bucket, `_editor_assets/svg/`).

Legacy designs reference these cliparts as `.swf` in two shapes: a relative
`assets/graphics/<category>/<name>.swf` (also seen as
`../editors/assets/graphics/...`) and a 2015-era S3-offloaded URL whose filename
is a 13-char `uniqid()` hash immediately followed by the built-in name
(`.../uploads/x/2015/11/<hash>icon_phone.swf`). The app can't render `.swf`, so
those items showed a placeholder / nothing. Both shapes are resolved to the
bundled SVG here by the built-in NAME — at import time before the asset
URL-rewrite/inline pass (`src/library/legacyImport.ts` ->
`rewriteLegacyClipartSources`) and again at document-load time
(`src/library/legacyClipart.ts` `remapLegacyClipartInDesign`, which also fixes
already-imported designs). The bundled SVG then flows through the renderer's
normal SVG path (`packages/renderer/src/clipart.ts` `isSvgSource` + per-layer
recolor), so the stored item colors keep applying.

Filenames are the lowercased `.swf` basename with a `.svg` extension. Only the
148 built-in clipart names actually referenced in the real legacy corpus that
had a rescued SVG are bundled here (of 171 distinct relative names ~86.5%; ~87.5%
of ALL corpus `.swf` occurrences across both shapes resolve). Unmatched `.swf`
sources and user-uploaded `.swf` keep their current behavior. Mapping:
`src/library/legacyClipartMap.ts`.
