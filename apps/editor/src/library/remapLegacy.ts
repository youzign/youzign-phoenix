// Single legacy-fidelity remap applied on every document load: rewrite legacy
// font names (Google + self-hosted) AND legacy `.swf` clipart sources to the
// bundled SVGs. Composes the two pure remaps and supplies `asset()` for the
// base-path-correct bundled clipart URLs. Use this instead of calling the
// individual remaps at each load site.

import type { Design } from "@youzign/designstring";
import { asset } from "../asset.js";
import { remapLegacyFontsInDesign } from "./legacyFonts.js";
import { remapLegacyClipartInDesign } from "./legacyClipart.js";

export function remapLegacyDesign(design: Design): Design {
  return remapLegacyClipartInDesign(remapLegacyFontsInDesign(design), asset);
}
