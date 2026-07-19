// Reconstruct the TRUE render geometry (scale + placement origin) of a text
// item from its stored legacy fields, disambiguating the two producers that
// write mcWidth/mcHeight AND the text-area anchor:
//
//   P1 — the original Flash editor. mcWidth/mcHeight are the AXIS-ALIGNED
//        BOUNDING BOX of the rotated+scaled text field (AS3 DisplayObject
//        `.width`/`.height` semantics):
//            mcWidth  = sx·taW·|cosθ| + sy·taH·|sinθ|
//            mcHeight = sx·taW·|sinθ| + sy·taH·|cosθ|
//        so the raw ratio mcWidth/textAreaWidth is NOT the scale for rotated
//        text (the "15x100 mtb vork" label: raw 0.4586/2.2387, true scale 1.0).
//        Flash also positions the text as a movie-clip whose registration point
//        (xpos,ypos) is the rotation pivot, with the text-area drawn at the
//        offset (textAreaxpos,textAreaypos)·scale INSIDE that rotated frame — so
//        the anchor offset is ROTATED into place, not added axis-aligned.
//
//   P2 — this app's own edit gestures (resizeTextCorner / resizeTextSide /
//        syncTextAreaHeight + the rotate gesture). They write mc = scale×area
//        (scale-semantics, even at θ≠0) and re-anchor xpos/ypos so the renderer
//        can keep pivoting at the text-area origin with an UN-rotated offset
//        (the shipped text-rotation-pivot fix). So P2 text must keep the
//        current origin math.
//
// At θ = 0 both producers/anchors coincide, so unrotated designs are byte-for-
// byte unaffected and both interpretations agree.
//
// For rotated text a single (mcW, mcH) can't reveal the producer, so we
// disambiguate with a prior validated against the legacy corpus
// (~/Projects/backup/dez73-extracts): real text is scaled UNIFORMLY (sx ≈ sy).
// 238/264 rotated legacy text items reconstruct to a near-uniform scale under
// the AABB interpretation while the scale-read yields absurd aspect ratios
// (sy up to 33×); in-app P2 text is uniform under the scale-read (sx = sy)
// while the AABB solve turns it non-uniform. We pick whichever interpretation
// is the more uniform (sx≈sy), which cleanly separates legacy AABB files from
// in-app scale files and keeps the P2 save/reload round-trip stable. The same
// flag drives the anchor: AABB ⇒ rotate the text-area offset (Flash), scale ⇒
// keep the current axis-aligned offset (this app).

export interface TextScaleFields {
  rotation: number;
  textAreaWidth: number;
  textAreaHeight: number;
  mcWidth: number;
  mcHeight: number;
}

export interface TextOriginFields extends TextScaleFields {
  xpos: number;
  ypos: number;
  textAreaxpos: number;
  textAreaypos: number;
}

// Below this |cos(2θ)| the 2×2 AABB solve is ill-conditioned (θ within ~0.6°
// of 45°/135°): there the AABB genuinely can't separate sx from sy, so fall
// back to a uniform-scale reconstruction.
const DET_EPS = 0.02;
// Below this |sin θ| (or |cos θ|) the text is effectively axis-aligned and the
// AABB equals scale×area — no reinterpretation needed.
const AXIS_EPS = 1e-4;

export interface TextScaleResult {
  sx: number;
  sy: number;
  /** true ⇒ legacy AABB semantics (Flash): rotate the text-area anchor offset. */
  aabb: boolean;
}

export function textScale(item: TextScaleFields): TextScaleResult {
  const taW = item.textAreaWidth;
  const taH = item.textAreaHeight;
  const sxScale = taW ? item.mcWidth / taW : 1;
  const syScale = taH ? item.mcHeight / taH : 1;
  const scaleRead: TextScaleResult = { sx: sxScale, sy: syScale, aabb: false };

  // No usable text-area size → nothing to reconstruct.
  if (!(taW > 0) || !(taH > 0)) return scaleRead;

  const rad = (item.rotation * Math.PI) / 180;
  const cAbs = Math.abs(Math.cos(rad));
  const sAbs = Math.abs(Math.sin(rad));

  // Axis-aligned: both interpretations agree, keep the raw ratio (byte-stable).
  if (sAbs < AXIS_EPS || cAbs < AXIS_EPS) return scaleRead;

  const det = cAbs * cAbs - sAbs * sAbs; // = cos(2θ)
  let sxAabb: number;
  let syAabb: number;
  if (Math.abs(det) < DET_EPS) {
    // Near 45°: assume uniform scale (the AABB can't distinguish sx from sy).
    sxAabb = item.mcWidth / (taW * cAbs + taH * sAbs);
    syAabb = item.mcHeight / (taW * sAbs + taH * cAbs);
  } else {
    // Exact inverse of the AABB forward model.
    const A = (item.mcWidth * cAbs - item.mcHeight * sAbs) / det; // = sx·taW
    const B = (item.mcHeight * cAbs - item.mcWidth * sAbs) / det; // = sy·taH
    sxAabb = A / taW;
    syAabb = B / taH;
  }

  // Reject a non-physical AABB solve (negative / non-finite) → scale-semantics.
  if (!(sxAabb > 0) || !(syAabb > 0) || !isFinite(sxAabb) || !isFinite(syAabb)) {
    return scaleRead;
  }
  if (!(sxScale > 0) || !(syScale > 0)) return { sx: sxAabb, sy: syAabb, aabb: true };

  // Uniform-scale prior: pick the interpretation with sx closest to sy.
  const distScale = Math.abs(Math.log(sxScale / syScale));
  const distAabb = Math.abs(Math.log(sxAabb / syAabb));
  return distAabb < distScale ? { sx: sxAabb, sy: syAabb, aabb: true } : scaleRead;
}

/**
 * Render origin (the point the text-area div's local (0,0) maps to) plus the
 * reconstructed scale. For legacy AABB text the anchor offset is rotated about
 * the (xpos,ypos) pivot (Flash movie-clip semantics); for in-app scale text it
 * is added axis-aligned (the current, pivot-compensated behavior). Both are
 * identical at θ = 0.
 */
export function textOrigin(item: TextOriginFields): {
  sx: number;
  sy: number;
  left: number;
  top: number;
  aabb: boolean;
} {
  const { sx, sy, aabb } = textScale(item);
  const dx = item.textAreaxpos * sx;
  const dy = item.textAreaypos * sy;
  if (!aabb) {
    return { sx, sy, aabb, left: item.xpos + dx, top: item.ypos + dy };
  }
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    sx,
    sy,
    aabb,
    left: item.xpos + (cos * dx - sin * dy),
    top: item.ypos + (sin * dx + cos * dy),
  };
}
