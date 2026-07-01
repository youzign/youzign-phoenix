// Background CSS derivation, ported from PanelBackgroundGradient.ts.

import type { CSSProperties } from "react";
import { signedIntToHex, type Design } from "@youzign/designstring";

/** Map stored angle -> CSS gradient degrees (from updateBackgroundGradientColor). */
export function gradientCssDeg(angle: number): number {
  switch (angle) {
    case 0: return 90;
    case 90: return 0;
    case 135: return 315;
    case 180: return 270;
    case -135: return 225;
    case -90: return 180;
    case -45: return 135;
    default: return angle; // e.g. 45 stays 45
  }
}

export function backgroundCss(design: Design): CSSProperties {
  if (design.transparent) {
    return { background: "transparent" };
  }

  if (design.bgType === "gradient") {
    const g1 = signedIntToHex(design.grad1);
    const g2 = signedIntToHex(design.grad2);
    const b = (design.ratio1 / 255) * 100;
    const e = (design.ratio2 / 255) * 100;
    if (design.isLinear) {
      const deg = gradientCssDeg(design.angle);
      return { background: `linear-gradient(${deg}deg, ${g1} ${b}%, ${g2} ${e}%)` };
    }
    return { background: `radial-gradient(circle, ${g1} ${b}%, ${g2} ${e}%)` };
  }

  // "color" (default). "pattern"/"image" fall back to solid bg_color for now.
  return { backgroundColor: signedIntToHex(design.bgColor) };
}
