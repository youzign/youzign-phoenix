# Legacy self-hosted fonts

These woff2 files are the **original font files the legacy Youzign editor shipped
for 10+ years**, rescued from the archived editor asset library
(`youzign-archive` B2 bucket, `_editor_assets/fonts/`).

They cover the legacy font names that have **no Google Fonts equivalent**
(Coolvetica, ChunkFive, SteinemRoman, Decker, FreeSans, ...). Without them,
legacy designs that used these faces fell back to a plain sans-serif, causing
text to reflow/overlap. See `src/library/legacyFontMap.ts`
(`LEGACY_SELF_HOST_FONTS`) for the name -> file mapping and
`src/legacyFontFaces.ts` for the @font-face injection.

Filenames are the normalized (lowercased, alphanumeric) legacy font name. Only
the ~51 families actually referenced in the real legacy corpus are bundled here,
not the full rescued library.

Reusing these files is the business's own asset library (the exact files the
product served for a decade); relicensing/replacement is a separate decision.
