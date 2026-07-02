// Model mutations that keep the raw attribute bag (which drives serialize())
// in perfect sync with the typed view. Every setter writes BOTH the typed
// field and rawAttrs[key] (as its original string form), appending to
// attrOrder when the attribute is new so serialization stays valid.

import {
  hexToSignedInt,
  serializeGlyphColors,
  signedIntToHex,
  type ClipartItem,
  type Design,
  type ImageItem,
  type Item,
  type RawCarrier,
  type TextCurvedItem,
  type TextItem,
} from "@youzign/designstring";
import {
  shapeDataUri,
  shapeDefaultSize,
  NO_FILL,
  isNoFill,
  type ShapeKind,
} from "./shapes.js";

let uidSeq = 1;
/** Non-serialized stable identity for selection tracking across z-order edits. */
export type WithUid = { _uid?: number };

export function ensureUid(item: Item & WithUid): number {
  if (item._uid === undefined) item._uid = uidSeq++;
  return item._uid;
}

function setRaw(carrier: RawCarrier, key: string, value: string): void {
  if (!(key in carrier.rawAttrs)) {
    carrier.attrOrder = [...carrier.attrOrder, key];
  }
  carrier.rawAttrs[key] = value;
}

const NUM_FIELDS: Record<string, string> = {
  xpos: "xpos",
  ypos: "ypos",
  width: "width",
  height: "height",
  rotation: "rotation",
  opacity: "opacity",
  index: "index",
  size: "size",
  scaleX: "scaleX",
  scaleY: "scaleY",
  // effect fields (legacy per-item attributes)
  shadowDistance: "shadow_distance",
  shadowAngle: "shadow_angle",
  shadowColor: "shadow_color",
  shadowOpacity: "shadow_opacity",
  borderSize: "border_size",
  borderColor: "border_color",
  blurSize: "blur_size",
  // curved-text arc attributes (legacy names)
  startAngle: "start_angle",
  endAngle: "end_angle",
  radius: "radius",
  // invert + image corner radius (legacy camelCase attribute names)
  invertIntensity: "invertIntensity",
  inputCornerTopLeft: "inputCornerTopLeft",
  inputCornerTopRight: "inputCornerTopRight",
  inputCornerBottomLeft: "inputCornerBottomLeft",
  inputCornerBottomRight: "inputCornerBottomRight",
};
const BOOL_FIELDS: Record<string, string> = {
  hFlip: "hFlip",
  vFlip: "vFlip",
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strikethrough: "strikethrough",
  isShadow: "is_shadow",
  isBorder: "is_border",
  isBlur: "is_blur",
  topDirection: "top_direction",
  useLetterAngle: "use_letter_angle",
  cropped: "cropped",
  isInvert: "isInvert",
  isCornerRadiusIndividual: "isCornerRadiusIndividual",
  isNoFill: "isNoFill",
};
const STR_FIELDS: Record<string, string> = {
  alignment: "alignment",
  font: "font",
  fontType: "fontType",
  source: "source",
  blendMode: "blendMode",
};

export interface ItemPatch {
  xpos?: number;
  ypos?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  index?: number;
  size?: number;
  scaleX?: number;
  scaleY?: number;
  hFlip?: boolean;
  vFlip?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  alignment?: string;
  font?: string;
  fontType?: string;
  content?: string;
  // effects (color fields are legacy signed-int values, matching the model)
  isShadow?: boolean;
  shadowDistance?: number;
  shadowAngle?: number;
  shadowColor?: number;
  shadowOpacity?: number;
  isBorder?: boolean;
  borderSize?: number;
  borderColor?: number;
  isBlur?: boolean;
  blurSize?: number;
  /** Hollow text: glyph fill goes transparent so only the outline shows. */
  isNoFill?: boolean;
  // blend mode + invert (legacy per-item attributes)
  blendMode?: string;
  isInvert?: boolean;
  invertIntensity?: number;
  // image corner radius (legacy uniform + per-corner)
  isCornerRadiusIndividual?: boolean;
  inputCornerTopLeft?: number;
  inputCornerTopRight?: number;
  inputCornerBottomLeft?: number;
  inputCornerBottomRight?: number;
  // curved text
  startAngle?: number;
  endAngle?: number;
  radius?: number;
  topDirection?: boolean;
  useLetterAngle?: boolean;
  // image
  source?: string;
  cropped?: boolean;
}

/** Apply a typed patch to an item, mutating in place and syncing rawAttrs. */
export function patchItem(item: Item & Record<string, any>, patch: ItemPatch): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (k === "content") {
      item.content = v as string;
      continue;
    }
    if (k in NUM_FIELDS) {
      item[k] = v as any;
      setRaw(item as RawCarrier, NUM_FIELDS[k], String(v));
    } else if (k in BOOL_FIELDS) {
      item[k] = v as any;
      setRaw(item as RawCarrier, BOOL_FIELDS[k], String(v));
    } else if (k in STR_FIELDS) {
      item[k] = v as any;
      setRaw(item as RawCarrier, STR_FIELDS[k], String(v));
    }
  }
}

/**
 * Recolor text uniformly. Preserves the existing per-glyph @@@ array UNLESS the
 * user explicitly recolors, at which point it collapses to one uniform color
 * across every glyph (spec §3).
 */
export function setTextColor(item: TextItem, hex: string): void {
  const int = hexToSignedInt(hex);
  const n = Math.max(1, Array.from(item.content).length);
  item.colors = new Array(n).fill(int);
  setRaw(item, "color", serializeGlyphColors(item.colors));
  item.isNoFill = false;
  setRaw(item, "isNoFill", "false");
}

/** Current uniform-ish fill color of a text item, as hex (first glyph). */
export function textColorHex(item: TextItem): string {
  return signedIntToHex(item.colors.length ? item.colors[0] : 0);
}

/**
 * Recolor a clipart. Two kinds of clipart are recolorable:
 *   1. parametric shapes (shape_kind) — regenerate the inline SVG data-URI.
 *   2. generic SVG clipart (Iconify, legacy library) — set the `colors` array
 *      + `color` attribute; the renderer repaints every fillable path from
 *      colors[0] (legacy Layer-band fallback), so recoloring "just works".
 */
export function setShapeFill(item: ClipartItem, hex: string): void {
  const kind = item.rawAttrs["shape_kind"] as ShapeKind | undefined;
  if (kind) {
    const uri = shapeDataUri(kind, hex);
    item.source = uri;
    setRaw(item, "source", uri);
    setRaw(item, "shape_fill", hex);
    return;
  }
  const int = hexToSignedInt(hex);
  item.colors = [int];
  setRaw(item, "color", serializeGlyphColors(item.colors));
}

/**
 * Set a parametric shape to a transparent (no) fill. Regenerates the inline SVG
 * with `fill="none"` and records `shape_fill="none"` so it round-trips; any
 * border/stroke effect keeps rendering. Recoloring with setShapeFill restores a
 * solid fill. No-op on non-shape clipart (generic SVGs recolor differently).
 */
export function setShapeNoFill(item: ClipartItem): void {
  const kind = item.rawAttrs["shape_kind"] as ShapeKind | undefined;
  if (!kind) return;
  const uri = shapeDataUri(kind, NO_FILL);
  item.source = uri;
  setRaw(item, "source", uri);
  setRaw(item, "shape_fill", NO_FILL);
}

export function isShape(item: Item): boolean {
  return item.type === "clipart" && !!(item as ClipartItem).rawAttrs["shape_kind"];
}

/** True when a parametric shape is currently set to a transparent (no) fill. */
export function isShapeNoFill(item: ClipartItem): boolean {
  return isNoFill(item.rawAttrs["shape_fill"] ?? "");
}

export function shapeFillHex(item: ClipartItem): string {
  const sf = item.rawAttrs["shape_fill"];
  if (sf && !isNoFill(sf)) return sf;
  if (sf && isNoFill(sf)) {
    // Transparent: fall back to the last solid color (if any) or a default so
    // the color picker shows a sane starting value.
    if (item.colors && item.colors.length) return signedIntToHex(item.colors[0]);
    return "#3b82f6";
  }
  if (item.rawAttrs["shape_fill"]) return item.rawAttrs["shape_fill"];
  if (item.colors && item.colors.length) return signedIntToHex(item.colors[0]);
  return "#3b82f6";
}

// ---- curved text ------------------------------------------------------------
//
// The legacy `text-curved` item stores `radius`, `start_angle`, `end_angle`,
// `top_direction`. We expose a single calm "curve amount" in [-100, 100]:
//   0        → straight (radius 0)
//   +N       → arcs up   (top_direction true),  larger N = tighter curve
//   -N       → arcs down (top_direction false)
// The angular span is derived from the text's own width so glyphs are not
// stretched: span = (|amount|/100) · 180°, and radius is chosen so that
// arcLength = radius · span(rad) ≈ text width. start/end angle are symmetric
// about the apex (±span/2) so the arc round-trips with real legacy values.

/** Rough rendered text width in px (matches the renderer's font metrics well
 *  enough for arc sizing; exact metrics aren't needed since span is stored). */
function estimateTextWidth(content: string, size: number): number {
  return Math.max(size, Array.from(content).length * size * 0.55);
}

const RAD = Math.PI / 180;

/** Read the current curve amount [-100,100] back from stored attributes. */
export function curveAmount(item: TextCurvedItem): number {
  const spanDeg = Math.abs(item.endAngle - item.startAngle);
  if (!(item.radius > 0) || spanDeg <= 0) return 0;
  const mag = Math.min(100, Math.round((spanDeg / 180) * 100));
  return item.topDirection ? mag : -mag;
}

/** Apply a curve amount, writing radius/start_angle/end_angle/top_direction. */
export function setCurve(item: TextCurvedItem, amount: number): void {
  const a = Math.max(-100, Math.min(100, amount));
  if (a === 0) {
    patchItem(item as any, { radius: 0, startAngle: 0, endAngle: 0 });
    return;
  }
  const topDirection = a > 0;
  const spanDeg = (Math.abs(a) / 100) * 180;
  const w = estimateTextWidth(item.content, item.size);
  const radius = Math.max(1, w / (spanDeg * RAD));
  patchItem(item as any, {
    radius: Math.round(radius),
    startAngle: -spanDeg / 2,
    endAngle: spanDeg / 2,
    topDirection,
  });
}

// ---- image crop -------------------------------------------------------------
//
// Youzign never stored a crop sub-region in the designstring (only the
// `cropped` boolean). Legacy "crop" produced a NEW baked image and updated the
// item's source + geometry. We reproduce that destructive model exactly: the
// caller bakes the selected sub-region to a new image (data-URI) and we update
// source / width / height / xpos / ypos and set cropped=true. No new attribute
// is invented, so untouched items stay byte-stable.

export interface CropRect {
  /** crop rectangle in canvas space (axis-aligned, within the image box) */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CropResult {
  /** source pixel region to copy from the natural-size image */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** new item geometry (canvas space) */
  xpos: number;
  ypos: number;
  width: number;
  height: number;
}

/** Pure crop math: map a canvas-space crop rect to source pixels + new box. */
export function computeCrop(
  item: ImageItem,
  crop: CropRect,
  naturalW: number,
  naturalH: number
): CropResult {
  const boxLeft = item.xpos - item.width / 2;
  const boxTop = item.ypos - item.height / 2;
  const fx = naturalW / item.width;
  const fy = naturalH / item.height;
  return {
    sx: (crop.x - boxLeft) * fx,
    sy: (crop.y - boxTop) * fy,
    sw: crop.w * fx,
    sh: crop.h * fy,
    xpos: crop.x + crop.w / 2,
    ypos: crop.y + crop.h / 2,
    width: crop.w,
    height: crop.h,
  };
}

/**
 * Swap only an image item's source (same destructive bake pattern as crop, but
 * geometry is unchanged). Used by background removal, which replaces the pixels
 * with a PNG-with-alpha cutout at the same box. No invented attributes.
 */
export function applySource(item: ImageItem, source: string): void {
  patchItem(item as any, { source });
}

/** Commit a crop: swap in the baked image + new geometry, mark cropped. */
export function applyCrop(
  item: ImageItem,
  bakedSource: string,
  geom: Pick<CropResult, "xpos" | "ypos" | "width" | "height">
): void {
  patchItem(item as any, {
    source: bakedSource,
    xpos: geom.xpos,
    ypos: geom.ypos,
    width: geom.width,
    height: geom.height,
    cropped: true,
  });
}

// ---- item construction ------------------------------------------------------

export function nextIndex(design: Design): number {
  return design.items.reduce((m, it) => Math.max(m, (it as any).index ?? 0), -1) + 1;
}

/** Build a RawCarrier from an ordered [key, value] list. */
function carrierFrom(pairs: [string, string][], known: Set<string>): RawCarrier {
  const rawAttrs: Record<string, string> = {};
  const attrOrder: string[] = [];
  const extraAttrs: Record<string, string> = {};
  for (const [k, v] of pairs) {
    rawAttrs[k] = v;
    attrOrder.push(k);
    if (!known.has(k)) extraAttrs[k] = v;
  }
  return { rawAttrs, attrOrder, extraAttrs };
}

const COMMON_DEFAULTS = (
  index: number,
  x: number,
  y: number,
  w: number,
  h: number
): [string, string][] => [
  ["index", String(index)],
  ["xpos", String(x)],
  ["ypos", String(y)],
  ["width", String(w)],
  ["height", String(h)],
  ["rotation", "0"],
  ["opacity", "1"],
  ["hFlip", "false"],
  ["vFlip", "false"],
  ["shadow_distance", "6"],
  ["shadow_angle", "45"],
  ["shadow_color", "0"],
  ["shadow_opacity", "0.26"],
  ["is_shadow", "false"],
  ["is_border", "false"],
  ["border_size", "0"],
  ["border_color", "0"],
  ["is_blur", "false"],
  ["blur_size", "0"],
];

/** Optional styling for a text item — powers the preset text layers. */
export interface TextPreset {
  content?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  /** Fill color as hex (defaults to a near-black ink). */
  color?: string;
  /** Text-area width in px (defaults to 460). */
  width?: number;
  alignment?: string;
  font?: string;
}

export function createTextItem(
  design: Design,
  x: number,
  y: number,
  preset: TextPreset = {}
): TextItem {
  const index = nextIndex(design);
  const size = preset.size ?? 54;
  const content = preset.content ?? "Double-click to edit";
  const bold = preset.bold ?? false;
  const italic = preset.italic ?? false;
  const font = preset.font ?? "Arvo";
  const alignment = preset.alignment ?? "center";
  const w = preset.width ?? 460;
  const h = Math.round(size * 1.35);
  const colorInt = hexToSignedInt(preset.color ?? "#222222");
  const colors = new Array(Array.from(content).length).fill(colorInt);
  const pairs: [string, string][] = [
    ["type", "text"],
    ...COMMON_DEFAULTS(index, x, y, 0, 0).filter(
      ([k]) => k !== "width" && k !== "height"
    ),
    ["font", font],
    ["fontType", "External Font"],
    ["strikethrough", "false"],
    ["size", String(size)],
    ["color", serializeGlyphColors(colors)],
    ["alignment", alignment],
    ["scalex", "1"],
    ["scaley", "1"],
    ["wrapping", "false"],
    ["scaleUsed", "true"],
    ["textAreaWidth", String(w)],
    ["textAreaHeight", String(h)],
    ["mcWidth", String(w)],
    ["mcHeight", String(h)],
    ["textAreaxpos", String(-w / 2)],
    ["textAreaypos", String(-h / 2)],
    ["bold", String(bold)],
    ["italic", String(italic)],
    ["isNoFill", "false"],
    ["underline", "false"],
  ];
  const known = new Set(pairs.map(([k]) => k));
  const carrier = carrierFrom(pairs, known);
  return {
    type: "text",
    ...carrier,
    index,
    xpos: x,
    ypos: y,
    width: 0,
    height: 0,
    rotation: 0,
    opacity: 1,
    hFlip: false,
    vFlip: false,
    shadowDistance: 6,
    shadowAngle: 45,
    shadowColor: 0,
    shadowOpacity: 0.26,
    isShadow: false,
    isBorder: false,
    borderSize: 0,
    borderColor: 0,
    isBlur: false,
    blurSize: 0,
    blendMode: "normal",
    isInvert: false,
    invertIntensity: 100,
    content,
    font,
    fontType: "External Font",
    strikethrough: false,
    size,
    colors,
    alignment,
    scalex: 1,
    scaley: 1,
    wrapping: false,
    scaleUsed: true,
    textAreaWidth: w,
    textAreaHeight: h,
    mcWidth: w,
    mcHeight: h,
    textAreaxpos: -w / 2,
    textAreaypos: -h / 2,
    bold,
    italic,
    isNoFill: false,
    underline: false,
  };
}

export interface ShapePreset {
  width?: number;
  height?: number;
  fill?: string;
  shadow?: boolean;
  border?: boolean;
  borderSize?: number;
  borderColor?: string;
}

export function createShapeItem(
  design: Design,
  kind: ShapeKind,
  x: number,
  y: number,
  preset: ShapePreset = {}
): ClipartItem {
  const index = nextIndex(design);
  const def = shapeDefaultSize(kind);
  const width = preset.width ?? def.width;
  const height = preset.height ?? def.height;
  const fill = preset.fill ?? "#3b82f6";
  const isShadow = preset.shadow ?? false;
  const isBorder = preset.border ?? false;
  const borderSize = preset.borderSize ?? 0;
  const borderColorInt = hexToSignedInt(preset.borderColor ?? "#000000");
  const uri = shapeDataUri(kind, fill);
  const pairs: [string, string][] = [
    ["type", "clipart"],
    ...COMMON_DEFAULTS(index, x, y, width, height),
    ["source", uri],
    ["source_svg", ""],
    ["color", ""],
    ["swf_id", ""],
    ["svg_id", ""],
    ["shape_kind", kind],
    ["shape_fill", fill],
  ];
  const known = new Set([
    "type", "index", "xpos", "ypos", "width", "height", "rotation", "opacity",
    "hFlip", "vFlip", "shadow_distance", "shadow_angle", "shadow_color",
    "shadow_opacity", "is_shadow", "is_border", "border_size", "border_color",
    "is_blur", "blur_size", "source", "source_svg", "color", "swf_id", "svg_id",
  ]);
  const carrier = carrierFrom(pairs, known);
  const item: ClipartItem = {
    type: "clipart",
    ...carrier,
    index,
    xpos: x,
    ypos: y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    hFlip: false,
    vFlip: false,
    shadowDistance: 6,
    shadowAngle: 45,
    shadowColor: 0,
    shadowOpacity: 0.26,
    isShadow: false,
    isBorder: false,
    borderSize: 0,
    borderColor: 0,
    isBlur: false,
    blurSize: 0,
    blendMode: "normal",
    isInvert: false,
    invertIntensity: 100,
    source: uri,
    sourceSvg: "",
    colors: [],
    swfId: "",
    svgId: "",
  };
  if (isShadow) patchItem(item as any, { isShadow: true });
  if (isBorder)
    patchItem(item as any, {
      isBorder: true,
      borderSize,
      borderColor: borderColorInt,
    });
  return item;
}

/**
 * Insert a recolorable SVG clipart from an external `.svg` URL (Iconify, legacy
 * library). Serializes as a legacy `clipart` item — identical shape to the
 * parametric shapes, minus `shape_kind`/`shape_fill` — so round-trip stays
 * valid. The `colors` array seeds the renderer's recolor (default dark grey).
 */
export function createClipartItem(
  design: Design,
  source: string,
  x: number,
  y: number,
  opts: {
    width?: number;
    height?: number;
    color?: string;
    /**
     * When false the item ships with an EMPTY colors array, so the renderer's
     * recolor pass is skipped and the SVG's own fills are preserved verbatim —
     * this is how colorful designed icons (flat-color-icons, twemoji…) render
     * faithfully instead of being flattened by the Layer-band recolor path.
     */
    recolorable?: boolean;
  } = {}
): ClipartItem {
  const index = nextIndex(design);
  const width = opts.width ?? 200;
  const height = opts.height ?? 200;
  const recolorable = opts.recolorable ?? true;
  const colorInt = hexToSignedInt(opts.color ?? "#333333");
  const colors = recolorable ? [colorInt] : [];
  const colorStr = recolorable ? serializeGlyphColors([colorInt]) : "";
  const pairs: [string, string][] = [
    ["type", "clipart"],
    ...COMMON_DEFAULTS(index, x, y, width, height),
    ["source", source],
    ["source_svg", ""],
    ["color", colorStr],
    ["swf_id", ""],
    ["svg_id", ""],
  ];
  const known = new Set([
    "type", "index", "xpos", "ypos", "width", "height", "rotation", "opacity",
    "hFlip", "vFlip", "shadow_distance", "shadow_angle", "shadow_color",
    "shadow_opacity", "is_shadow", "is_border", "border_size", "border_color",
    "is_blur", "blur_size", "source", "source_svg", "color", "swf_id", "svg_id",
  ]);
  const carrier = carrierFrom(pairs, known);
  return {
    type: "clipart",
    ...carrier,
    index,
    xpos: x,
    ypos: y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    hFlip: false,
    vFlip: false,
    shadowDistance: 6,
    shadowAngle: 45,
    shadowColor: 0,
    shadowOpacity: 0.26,
    isShadow: false,
    isBorder: false,
    borderSize: 0,
    borderColor: 0,
    isBlur: false,
    blurSize: 0,
    blendMode: "normal",
    isInvert: false,
    invertIntensity: 100,
    source,
    sourceSvg: "",
    colors,
    swfId: "",
    svgId: "",
  };
}

/**
 * Insert a raster image (stock photo). Serializes as a legacy `image` item so
 * round-trip stays valid. `pixabay` mirrors the legacy provider flag.
 */
export function createImageItem(
  design: Design,
  source: string,
  x: number,
  y: number,
  size: { width: number; height: number },
  opts: { pixabay?: boolean } = {}
): ImageItem {
  const index = nextIndex(design);
  const { width, height } = size;
  const pixabay = opts.pixabay ?? false;
  const pairs: [string, string][] = [
    ["type", "image"],
    ...COMMON_DEFAULTS(index, x, y, width, height),
    ["source", source],
    ["color", ""],
    ["canBeCropped", "true"],
    ["cropped", "false"],
    ["pixabay", String(pixabay)],
  ];
  const known = new Set([
    "type", "index", "xpos", "ypos", "width", "height", "rotation", "opacity",
    "hFlip", "vFlip", "shadow_distance", "shadow_angle", "shadow_color",
    "shadow_opacity", "is_shadow", "is_border", "border_size", "border_color",
    "is_blur", "blur_size", "source", "color", "canBeCropped", "cropped", "pixabay",
  ]);
  const carrier = carrierFrom(pairs, known);
  return {
    type: "image",
    ...carrier,
    index,
    xpos: x,
    ypos: y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    hFlip: false,
    vFlip: false,
    shadowDistance: 6,
    shadowAngle: 45,
    shadowColor: 0,
    shadowOpacity: 0.26,
    isShadow: false,
    isBorder: false,
    borderSize: 0,
    borderColor: 0,
    isBlur: false,
    blurSize: 0,
    blendMode: "normal",
    isInvert: false,
    invertIntensity: 100,
    source,
    color: "",
    canBeCropped: true,
    cropped: false,
    pixabay,
    isCornerRadiusIndividual: false,
    inputCornerTopLeft: 0,
    inputCornerTopRight: 0,
    inputCornerBottomLeft: 0,
    inputCornerBottomRight: 0,
  };
}

/**
 * Fit a natural (imgW × imgH) asset into the canvas at ~60% coverage, centred,
 * returning the insert box. Pure geometry — used by both photo & clipart insert.
 */
export function fitToCanvas(
  design: Design,
  imgW: number,
  imgH: number,
  coverage = 0.6
): { x: number; y: number; width: number; height: number } {
  const maxW = design.canvasWidth * coverage;
  const maxH = design.canvasHeight * coverage;
  const ratio = imgW > 0 && imgH > 0 ? imgW / imgH : 1;
  let width = maxW;
  let height = width / ratio;
  if (height > maxH) {
    height = maxH;
    width = height * ratio;
  }
  return {
    x: design.canvasWidth / 2,
    y: design.canvasHeight / 2,
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** Deep clone an item and give it a fresh index + uid (for duplicate). */
export function cloneItemForDuplicate(design: Design, item: Item): Item {
  const copy = structuredClone(item) as Item & WithUid & Record<string, any>;
  copy._uid = uidSeq++;
  const index = nextIndex(design);
  copy.index = index;
  setRaw(copy as RawCarrier, "index", String(index));
  // Nudge so the duplicate is visible.
  if ("xpos" in copy) {
    copy.xpos += 24;
    copy.ypos += 24;
    setRaw(copy as RawCarrier, "xpos", String(copy.xpos));
    setRaw(copy as RawCarrier, "ypos", String(copy.ypos));
  }
  return copy;
}

// ---- combos -----------------------------------------------------------------
//
// A combo inserts several pre-styled items at once, laid out relative to the
// canvas centre (a banner + a centred text layer, a circle badge + label, …).
// Pure: returns the fully-positioned items (each a separate layer with a
// sequential index) so the store can push + select them. Layout math is
// resolved here to canvas coordinates, making it unit-testable.

export type ComboId = "ribbon-text" | "badge" | "button" | "quote-card";

export interface ComboDef {
  id: ComboId;
  label: string;
}

export const COMBOS: ComboDef[] = [
  { id: "ribbon-text", label: "Ribbon + text" },
  { id: "badge", label: "Badge" },
  { id: "button", label: "Button" },
  { id: "quote-card", label: "Quote card" },
];

const ACCENT = "#4f46e5";

/** Build the positioned items for a combo, centred on the canvas. */
export function insertCombo(design: Design, combo: ComboId): Item[] {
  const cx = design.canvasWidth / 2;
  const cy = design.canvasHeight / 2;
  const base = nextIndex(design);
  const items: Item[] = [];
  const add = (it: Item) => {
    patchItem(it as any, { index: base + items.length });
    items.push(it);
    return it;
  };

  switch (combo) {
    case "ribbon-text": {
      add(
        createShapeItem(design, "rect", cx, cy, {
          width: 560,
          height: 120,
          fill: ACCENT,
          shadow: true,
        })
      );
      add(
        createTextItem(design, cx, cy, {
          content: "YOUR HEADLINE",
          size: 48,
          bold: true,
          color: "#ffffff",
          width: 520,
        })
      );
      break;
    }
    case "badge": {
      add(
        createShapeItem(design, "ellipse", cx, cy, {
          width: 220,
          height: 220,
          fill: ACCENT,
          shadow: true,
        })
      );
      add(
        createTextItem(design, cx, cy, {
          content: "NEW",
          size: 46,
          bold: true,
          color: "#ffffff",
          width: 200,
        })
      );
      break;
    }
    case "button": {
      add(
        createShapeItem(design, "rect", cx, cy, {
          width: 300,
          height: 92,
          fill: ACCENT,
          shadow: true,
        })
      );
      add(
        createTextItem(design, cx, cy, {
          content: "Click here",
          size: 32,
          bold: true,
          color: "#ffffff",
          width: 280,
        })
      );
      break;
    }
    case "quote-card": {
      add(
        createShapeItem(design, "rect", cx, cy, {
          width: 640,
          height: 360,
          fill: "#f5f5f4",
          shadow: true,
        })
      );
      add(
        createTextItem(design, cx, cy - 34, {
          content: "“Design is intelligence made visible.”",
          size: 40,
          italic: true,
          color: "#1c1c1e",
          width: 540,
        })
      );
      add(
        createTextItem(design, cx, cy + 96, {
          content: "— Alina Wheeler",
          size: 24,
          color: "#6b7280",
          width: 540,
        })
      );
      break;
    }
  }

  return items;
}

export { setRaw };
