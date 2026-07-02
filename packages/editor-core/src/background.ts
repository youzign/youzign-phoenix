// Canvas-level (background) mutations, byte-faithful to the legacy editor.
//
// Legacy attribute semantics (from editor/src/PanelBackgroundGradient.ts,
// PanelBackgroundSolid.ts, LoadProject.ts, Utils.ts):
//   bg_type      "color" | "gradient" | "pattern" | "image"
//   bg_color     signed 24-bit int (loaded via intToHex → hex in-memory)
//   transparent  "true" | "false"
//   is_linear    "true" (linear gradient) | "false" (radial)
//   is_reverse   "true" | "false"  (reverse swaps grad1/grad2)
//   grad1/grad2  signed 24-bit int gradient stops
//   ratio1/ratio2  gradient stop positions on a 0–255 scale (default 0 / 255)
//   angle        gradient angle: one of 0,45,90,135,180,-45,-90,-135
//   border_width number of px
//   border_color signed 24-bit int
//
// Every setter writes ONLY the attributes the user touches (into rawAttrs,
// which drives serialize()), so untouched designs stay byte-stable. Typed
// fields are kept in sync so the renderer + panel read consistent values.

import {
  hexToSignedInt,
  signedIntToHex,
  type Design,
  type RawCarrier,
} from "@youzign/designstring";
import { setRaw } from "./mutations.js";

/**
 * The 25 legacy gradient presets (editor/src/PanelBackgroundGradient.ts
 * `gradientsList`), each an ordered [start, end] hex pair.
 */
export const GRADIENT_PRESETS: readonly [string, string][] = [
  ["#f1d611", "#c27a01"],
  ["#ee5b5b", "#be1925"],
  ["#5dd7df", "#038297"],
  ["#5ee641", "#1a7f12"],
  ["#565676", "#1f202d"],
  ["#204754", "#061215"],
  ["#fefefe", "#a5b8bb"],
  ["#3a99ff", "#7a5dff"],
  ["#7aeefc", "#64ff47"],
  ["#fa9686", "#f9349a"],
  ["#fff06c", "#fbc9ae"],
  ["#58f9e8", "#d1ffa7"],
  ["#ffad21", "#de4a6b"],
  ["#c39191", "#446182"],
  ["#3194ff", "#db00ff"],
  ["#ff0101", "#cb69e4"],
  ["#01ffe9", "#8e69e4"],
  ["#5acafe", "#09f8c3"],
  ["#f8f8f8", "#fbff00"],
  ["#49d0da", "#00076c"],
  ["#da4949", "#1e006c"],
  ["#00ffab", "#28314b"],
  ["#e7de3c", "#16443a"],
  ["#ef5e30", "#ff0a24"],
  ["#dbabd3", "#eb0045"],
];

/** The 8 legacy linear-gradient angle presets (handleAngleClick order). */
export const GRADIENT_ANGLES: readonly number[] = [90, 45, 0, -45, -90, -135, 180, 135];

const d = (design: Design) => design as unknown as RawCarrier;

// ---- solid + transparent ----------------------------------------------------

/** Set a solid background color. Mirrors buttonBackgroundColor / ColorPicker. */
export function setBackgroundColor(design: Design, hex: string): void {
  design.bgType = "color";
  setRaw(d(design), "bg_type", "color");
  design.bgColor = hexToSignedInt(hex);
  setRaw(d(design), "bg_color", String(design.bgColor));
  design.transparent = false;
  setRaw(d(design), "transparent", "false");
}

/** Current solid background color as hex. */
export function backgroundColorHex(design: Design): string {
  return signedIntToHex(design.bgColor);
}

/** Toggle transparency (legacy buttonTransparentBackground). */
export function setTransparent(design: Design, transparent: boolean): void {
  design.transparent = transparent;
  setRaw(d(design), "transparent", String(transparent));
}

// ---- gradient ---------------------------------------------------------------

/** Apply a gradient preset by index (legacy handleGradientButtonClick). */
export function setGradientPreset(design: Design, index: number): void {
  const preset = GRADIENT_PRESETS[index];
  if (!preset) return;
  design.bgType = "gradient";
  setRaw(d(design), "bg_type", "gradient");
  setGradientStop(design, 1, preset[0]);
  setGradientStop(design, 2, preset[1]);
  // Legacy: if the stops are bunched (<20), reset the slider to full spread.
  if (design.ratio2 - design.ratio1 < 20) {
    setGradientRatios(design, 0, 255);
  }
  design.transparent = false;
  setRaw(d(design), "transparent", "false");
}

/** Set one gradient stop color (which = 1 → grad1, 2 → grad2). */
export function setGradientStop(design: Design, which: 1 | 2, hex: string): void {
  const int = hexToSignedInt(hex);
  if (which === 1) {
    design.grad1 = int;
    setRaw(d(design), "grad1", String(int));
  } else {
    design.grad2 = int;
    setRaw(d(design), "grad2", String(int));
  }
}

/** Hex value of a gradient stop. */
export function gradientStopHex(design: Design, which: 1 | 2): string {
  return signedIntToHex(which === 1 ? design.grad1 : design.grad2);
}

/** Linear ↔ radial (legacy handleBackgroundTypeChange). */
export function setGradientLinear(design: Design, isLinear: boolean): void {
  design.isLinear = isLinear;
  setRaw(d(design), "is_linear", String(isLinear));
}

/** Set the gradient angle; forces linear (legacy setBackgroundGradientAngle). */
export function setGradientAngle(design: Design, angle: number): void {
  design.isLinear = true;
  setRaw(d(design), "is_linear", "true");
  design.angle = angle;
  setRaw(d(design), "angle", String(angle));
}

/** Set gradient stop positions on the legacy 0–255 scale. */
export function setGradientRatios(design: Design, ratio1: number, ratio2: number): void {
  design.ratio1 = ratio1;
  setRaw(d(design), "ratio1", String(ratio1));
  design.ratio2 = ratio2;
  setRaw(d(design), "ratio2", String(ratio2));
}

/**
 * Reverse the gradient: swap grad1/grad2 and flip is_reverse
 * (legacy handleReverseBackgroundClick).
 */
export function reverseGradient(design: Design): void {
  const g1 = design.grad1;
  design.grad1 = design.grad2;
  design.grad2 = g1;
  setRaw(d(design), "grad1", String(design.grad1));
  setRaw(d(design), "grad2", String(design.grad2));
  design.isReverse = !design.isReverse;
  setRaw(d(design), "is_reverse", String(design.isReverse));
}

// ---- border -----------------------------------------------------------------

/** Set the canvas border width in px (legacy border_width). */
export function setBorderWidth(design: Design, width: number): void {
  design.borderWidth = width;
  setRaw(d(design), "border_width", String(width));
}

/** Set the canvas border color (legacy border_color, signed int). */
export function setBorderColor(design: Design, hex: string): void {
  design.borderColor = hexToSignedInt(hex);
  setRaw(d(design), "border_color", String(design.borderColor));
}

/** Hex value of the canvas border color. */
export function borderColorHex(design: Design): string {
  return signedIntToHex(design.borderColor);
}
