// Color utilities faithful to the legacy Flash intToHex (Utils.ts).
// Colors in the designstring format are SIGNED 24-bit ints.

const MASK_24 = 0x1000000; // 16777216

function normalize24(n: number): number {
  // Flash stores negative signed ints; mask to 24-bit unsigned first.
  return ((Math.trunc(n) % MASK_24) + MASK_24) % MASK_24;
}

function toHexByte(n: number): string {
  const s = n.toString(16);
  return s.length >= 2 ? s : "0".repeat(2 - s.length) + s;
}

/**
 * signedIntToHex — exact port of legacy intToHex, with negative normalization.
 *   r = floor(floor(n/256)/256) % 256
 *   g = floor(n/256) % 256
 *   b = n % 256
 */
export function signedIntToHex(n: number): string {
  const c = normalize24(n);
  const r = Math.floor(Math.floor(c / 256) / 256) % 256;
  const g = Math.floor(c / 256) % 256;
  const b = c % 256;
  return "#" + toHexByte(r) + toHexByte(g) + toHexByte(b);
}

/**
 * hexToSignedInt — inverse of signedIntToHex, producing the positive int form.
 */
export function hexToSignedInt(hex: string): number {
  const h = hex.replace(/^#/, "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return r * 65536 + g * 256 + b;
}

/** parseGlyphColors("a@@@b@@@...") -> number[] */
export function parseGlyphColors(value: string): number[] {
  if (value === undefined || value === null || value === "") return [];
  return value.split("@@@").map((t) => Number(t));
}

/** serializeGlyphColors(number[]) -> "a@@@b@@@..." */
export function serializeGlyphColors(colors: number[]): string {
  return colors.map((c) => String(c)).join("@@@");
}
