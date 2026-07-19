// DOM side of the self-hosted legacy fonts: inject an @font-face stylesheet for
// legacy faces that have no Google Fonts equivalent (Coolvetica, ChunkFive,
// SteinemRoman, ...). The files ship in apps/editor/public/legacy-fonts/ and are
// referenced through `asset()` so the URL is correct both on the web (served
// under /editor/) and in the Tauri desktop build (served at /). This mirrors
// `ensureGoogleFonts` in ./fonts.ts — pure font list in, <style> injected once.

import type { SelfHostFont } from "./library/legacyFonts.js";
import { asset } from "./asset.js";

const injected = new Set<string>();

/** CSS-escape a font-family name for use inside quotes in an @font-face rule. */
function cssFamily(family: string): string {
  return `"${family.replace(/["\\]/g, "\\$&")}"`;
}

/** Inject an @font-face for each self-hosted legacy font (once per family). */
export function ensureLegacyFonts(fonts: SelfHostFont[]): void {
  if (typeof document === "undefined") return;
  const pending = fonts.filter((f) => f.family && f.file && !injected.has(f.family));
  if (pending.length === 0) return;

  const rules = pending
    .map((f) => {
      const url = asset(`/legacy-fonts/${f.file}`);
      return `@font-face{font-family:${cssFamily(f.family)};src:url(${JSON.stringify(url)}) format("woff2");font-display:swap;}`;
    })
    .join("\n");

  const style = document.createElement("style");
  style.setAttribute("data-legacy-fonts", "");
  style.textContent = rules;
  document.head.appendChild(style);

  for (const f of pending) injected.add(f.family);
}
