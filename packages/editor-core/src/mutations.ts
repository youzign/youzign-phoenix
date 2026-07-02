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
  type Item,
  type RawCarrier,
  type TextItem,
} from "@youzign/designstring";
import {
  shapeDataUri,
  shapeDefaultSize,
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
};
const STR_FIELDS: Record<string, string> = {
  alignment: "alignment",
  font: "font",
  fontType: "fontType",
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

/** Recolor a shape clipart by regenerating its inline SVG data-URI. */
export function setShapeFill(item: ClipartItem, hex: string): void {
  const kind = item.rawAttrs["shape_kind"] as ShapeKind | undefined;
  if (!kind) return;
  const uri = shapeDataUri(kind, hex);
  item.source = uri;
  setRaw(item, "source", uri);
  setRaw(item, "shape_fill", hex);
}

export function isShape(item: Item): boolean {
  return item.type === "clipart" && !!(item as ClipartItem).rawAttrs["shape_kind"];
}

export function shapeFillHex(item: ClipartItem): string {
  return item.rawAttrs["shape_fill"] || "#3b82f6";
}

// ---- item construction ------------------------------------------------------

function nextIndex(design: Design): number {
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

export function createTextItem(design: Design, x: number, y: number): TextItem {
  const index = nextIndex(design);
  const size = 54;
  const content = "Double-click to edit";
  const w = 460;
  const h = Math.round(size * 1.35);
  const colorInt = hexToSignedInt("#222222");
  const colors = new Array(Array.from(content).length).fill(colorInt);
  const pairs: [string, string][] = [
    ["type", "text"],
    ...COMMON_DEFAULTS(index, x, y, 0, 0).filter(
      ([k]) => k !== "width" && k !== "height"
    ),
    ["font", "Arvo"],
    ["fontType", "External Font"],
    ["strikethrough", "false"],
    ["size", String(size)],
    ["color", serializeGlyphColors(colors)],
    ["alignment", "center"],
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
    ["bold", "false"],
    ["italic", "false"],
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
    content,
    font: "Arvo",
    fontType: "External Font",
    strikethrough: false,
    size,
    colors,
    alignment: "center",
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
    bold: false,
    italic: false,
    isNoFill: false,
    underline: false,
  };
}

export function createShapeItem(
  design: Design,
  kind: ShapeKind,
  x: number,
  y: number
): ClipartItem {
  const index = nextIndex(design);
  const { width, height } = shapeDefaultSize(kind);
  const fill = "#3b82f6";
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
    source: uri,
    sourceSvg: "",
    colors: [],
    swfId: "",
    svgId: "",
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

export { setRaw };
