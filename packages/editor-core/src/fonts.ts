// Font handling for text items.
//
// Legacy Youzign models a text item's typeface with two attributes:
//   font     - the family name (e.g. "Arvo", "Open Sans")
//   fontType - the loading category; every stock Youzign face was a Google
//              webfont, serialized as "External Font".
// Bold / italic are SEPARATE boolean fields on the item, so the picker only
// ever chooses a *family* — weight/style come from the B / I toggles.
//
// This module is pure (no DOM). The editor app owns the actual <link> injection
// so we stay testable and the renderer package stays side-effect free.

import type { ItemPatch } from "./mutations.js";

/** The value legacy writes into `fontType` for any Google/webfont family. */
export const EXTERNAL_FONT = "External Font";

/**
 * Curated family list: every family observed in the fixtures (Arvo) plus a
 * popular Google Fonts set. Each family here ships regular (400) AND bold (700)
 * weights so the B toggle always resolves, and requesting them from the CSS2
 * API never 400s. Sorted for a calm, scannable dropdown.
 */
export const GOOGLE_FONTS: string[] = [
  "Abril Fatface",
  "Anton",
  "Archivo Black",
  "Arvo",
  "Bebas Neue",
  "Bitter",
  "Cabin",
  "Cormorant Garamond",
  "Dancing Script",
  "EB Garamond",
  "Fjalla One",
  "Josefin Sans",
  "Lato",
  "Libre Baskerville",
  "Lobster",
  "Merriweather",
  "Montserrat",
  "Mukta",
  "Nunito",
  "Open Sans",
  "Oswald",
  "Pacifico",
  "Playfair Display",
  "Poppins",
  "PT Sans",
  "PT Serif",
  "Quicksand",
  "Raleway",
  "Roboto",
  "Roboto Condensed",
  "Roboto Slab",
  "Rubik",
  "Source Sans 3",
  "Titillium Web",
  "Ubuntu",
  "Work Sans",
];

/**
 * The typed patch for changing a text item's family. Writes `font` and pins
 * `fontType` to "External Font" (a Google webfont), matching legacy exactly so
 * the round-trip stays faithful.
 */
export function fontPatch(family: string): ItemPatch {
  return { font: family, fontType: EXTERNAL_FONT };
}

/** URL-encode a family for the Google Fonts CSS2 `family=` param. */
export function familyToParam(family: string): string {
  // spaces -> "+", request regular + bold so the B toggle resolves.
  return `${family.trim().replace(/ +/g, "+")}:wght@400;700`;
}

/**
 * Build a Google Fonts CSS2 stylesheet href for the given families. Returns
 * null for an empty list. Families are de-duplicated and ordered stably so the
 * same set always yields the same URL (cheap caching / dedupe key).
 */
export function googleFontsHref(families: string[]): string | null {
  const unique = Array.from(new Set(families.map((f) => f.trim()).filter(Boolean)));
  if (unique.length === 0) return null;
  const params = unique.map((f) => `family=${familyToParam(f)}`).join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
