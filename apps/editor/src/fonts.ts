// DOM side of font loading: inject Google Fonts <link> stylesheets on demand.
// Pure logic (family list, URL building, field mapping) lives in editor-core.

import { googleFontsHref } from "@youzign/editor-core";

const loaded = new Set<string>();

/** Inject a Google Fonts stylesheet for the given families (once each). */
export function ensureGoogleFonts(families: string[]): void {
  if (typeof document === "undefined") return;
  const pending = families
    .map((f) => f.trim())
    .filter((f) => f && !loaded.has(f));
  if (pending.length === 0) return;

  const href = googleFontsHref(pending);
  if (!href) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);

  for (const f of pending) loaded.add(f);
}
