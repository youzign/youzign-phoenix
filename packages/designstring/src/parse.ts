import { XMLParser } from "fast-xml-parser";
import { parseGlyphColors } from "./color.js";
import type {
  Design,
  Item,
  ItemType,
  RawCarrier,
} from "./types.js";

const ATTRS = ":@";
const CDATA = "#cdata";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  attributesGroupName: ATTRS,
  cdataPropName: CDATA,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
});

// ---- known attribute name sets (for extraAttrs / forward-compat) ----

const DATA_KNOWN = new Set([
  "template_type", "pattern_index", "bg_color", "border_color", "border_width",
  "is_linear", "is_reverse", "grad1", "grad2", "ratio1", "ratio2", "angle",
  "bg_type", "transparent", "pattern_color", "canvas_width", "canvas_height", "dpi",
]);

const COMMON_KNOWN = [
  "type", "index", "xpos", "ypos", "width", "height", "rotation", "opacity",
  "hFlip", "vFlip", "shadow_distance", "shadow_angle", "shadow_color",
  "shadow_opacity", "is_shadow", "is_border", "border_size", "border_color",
  "is_blur", "blur_size", "blendMode", "isInvert", "invertIntensity",
];

const IMAGE_CORNER_KNOWN = [
  "isCornerRadiusIndividual", "inputCornerTopLeft", "inputCornerTopRight",
  "inputCornerBottomLeft", "inputCornerBottomRight",
];

const KNOWN_BY_TYPE: Record<string, Set<string>> = {
  image: new Set([...COMMON_KNOWN, "source", "color", "canBeCropped", "cropped", "pixabay",
    ...IMAGE_CORNER_KNOWN]),
  text: new Set([...COMMON_KNOWN, "font", "fontType", "strikethrough", "size", "color",
    "alignment", "scalex", "scaley", "wrapping", "scaleUsed", "textAreaWidth",
    "textAreaHeight", "mcWidth", "mcHeight", "textAreaxpos", "textAreaypos",
    "bold", "italic", "isNoFill", "underline"]),
  "text-curved": new Set([...COMMON_KNOWN, "font", "fontType", "strikethrough", "size",
    "color", "alignment", "scalex", "scaley", "wrapping", "scaleUsed", "textAreaWidth",
    "textAreaHeight", "mcWidth", "mcHeight", "textAreaxpos", "textAreaypos", "bold",
    "italic", "isNoFill", "underline", "start_angle", "end_angle", "radius",
    "top_direction", "use_letter_angle"]),
  clipart: new Set([...COMMON_KNOWN, "source", "source_svg", "color", "swf_id", "svg_id"]),
  group: new Set([...COMMON_KNOWN, "isSavedInLib", "scaleX", "scaleY"]),
  filter: new Set([
    "type",
    "filterid",
    "opacity",
    "adj_brightness",
    "adj_contrast",
    "adj_saturation",
    "adj_hue",
    "adj_warmth",
    "adj_vignette",
  ]),
};

// ---- coercion helpers ----

const num = (r: Record<string, string>, k: string, d = 0): number =>
  r[k] === undefined || r[k] === "" ? d : Number(r[k]);
const bool = (r: Record<string, string>, k: string): boolean => r[k] === "true";
const str = (r: Record<string, string>, k: string, d = ""): string =>
  r[k] === undefined ? d : r[k];

function rawCarrier(attrs: Record<string, string>, known: Set<string>): RawCarrier {
  const attrOrder = Object.keys(attrs);
  const extraAttrs: Record<string, string> = {};
  for (const k of attrOrder) if (!known.has(k)) extraAttrs[k] = attrs[k];
  return { rawAttrs: { ...attrs }, attrOrder, extraAttrs };
}

function getAttrs(node: any): Record<string, string> {
  const a = node[ATTRS] ?? {};
  const out: Record<string, string> = {};
  for (const k of Object.keys(a)) out[k] = String(a[k]);
  return out;
}

function getCData(node: any): string {
  const keys = Object.keys(node);
  for (const k of keys) {
    if (k === ATTRS) continue;
    const v = node[k];
    if (k === CDATA) {
      if (Array.isArray(v)) return v.map((x) => x[CDATA] ?? x).join("");
      return String(v);
    }
  }
  // fast-xml-parser nests cdata array form: node["#cdata"] = [{ "#cdata": "..." }]
  const c = node[CDATA];
  if (Array.isArray(c)) return c.map((x: any) => x[CDATA] ?? "").join("");
  if (typeof c === "string") return c;
  return "";
}

function childItems(node: any): any[] {
  const raw = node.item;
  if (raw === undefined) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function parseCommon(attrs: Record<string, string>) {
  return {
    index: num(attrs, "index"),
    xpos: num(attrs, "xpos"),
    ypos: num(attrs, "ypos"),
    width: num(attrs, "width"),
    height: num(attrs, "height"),
    rotation: num(attrs, "rotation"),
    opacity: num(attrs, "opacity", 1),
    hFlip: bool(attrs, "hFlip"),
    vFlip: bool(attrs, "vFlip"),
    shadowDistance: num(attrs, "shadow_distance"),
    shadowAngle: num(attrs, "shadow_angle"),
    shadowColor: num(attrs, "shadow_color"),
    shadowOpacity: num(attrs, "shadow_opacity"),
    isShadow: bool(attrs, "is_shadow"),
    isBorder: bool(attrs, "is_border"),
    borderSize: num(attrs, "border_size"),
    borderColor: num(attrs, "border_color"),
    isBlur: bool(attrs, "is_blur"),
    blurSize: num(attrs, "blur_size"),
    blendMode: str(attrs, "blendMode", "normal"),
    isInvert: bool(attrs, "isInvert"),
    invertIntensity: num(attrs, "invertIntensity", 100),
  };
}

function parseTextFields(attrs: Record<string, string>, content: string) {
  return {
    content,
    font: str(attrs, "font"),
    fontType: str(attrs, "fontType"),
    strikethrough: bool(attrs, "strikethrough"),
    size: num(attrs, "size"),
    colors: parseGlyphColors(str(attrs, "color")),
    alignment: str(attrs, "alignment", "left"),
    scalex: num(attrs, "scalex", 1),
    scaley: num(attrs, "scaley", 1),
    wrapping: bool(attrs, "wrapping"),
    scaleUsed: bool(attrs, "scaleUsed"),
    textAreaWidth: num(attrs, "textAreaWidth"),
    textAreaHeight: num(attrs, "textAreaHeight"),
    mcWidth: num(attrs, "mcWidth"),
    mcHeight: num(attrs, "mcHeight"),
    textAreaxpos: num(attrs, "textAreaxpos"),
    textAreaypos: num(attrs, "textAreaypos"),
    bold: bool(attrs, "bold"),
    italic: bool(attrs, "italic"),
    isNoFill: bool(attrs, "isNoFill"),
    underline: bool(attrs, "underline"),
  };
}

function parseItem(node: any): Item {
  const attrs = getAttrs(node);
  const type = (attrs.type ?? "") as ItemType;
  const known = KNOWN_BY_TYPE[type] ?? new Set(COMMON_KNOWN);
  const carrier = rawCarrier(attrs, known);

  switch (type) {
    case "image":
      return {
        type, ...carrier, ...parseCommon(attrs),
        source: str(attrs, "source"),
        color: str(attrs, "color"),
        canBeCropped: bool(attrs, "canBeCropped"),
        cropped: bool(attrs, "cropped"),
        pixabay: bool(attrs, "pixabay"),
        isCornerRadiusIndividual: bool(attrs, "isCornerRadiusIndividual"),
        inputCornerTopLeft: num(attrs, "inputCornerTopLeft"),
        inputCornerTopRight: num(attrs, "inputCornerTopRight"),
        inputCornerBottomLeft: num(attrs, "inputCornerBottomLeft"),
        inputCornerBottomRight: num(attrs, "inputCornerBottomRight"),
      };
    case "text":
      return {
        type, ...carrier, ...parseCommon(attrs),
        ...parseTextFields(attrs, getCData(node)),
      };
    case "text-curved":
      return {
        type, ...carrier, ...parseCommon(attrs),
        ...parseTextFields(attrs, getCData(node)),
        startAngle: num(attrs, "start_angle"),
        endAngle: num(attrs, "end_angle"),
        radius: num(attrs, "radius"),
        topDirection: bool(attrs, "top_direction"),
        useLetterAngle: bool(attrs, "use_letter_angle"),
      };
    case "clipart":
      return {
        type, ...carrier, ...parseCommon(attrs),
        source: str(attrs, "source"),
        sourceSvg: str(attrs, "source_svg"),
        colors: parseGlyphColors(str(attrs, "color")),
        swfId: str(attrs, "swf_id"),
        svgId: str(attrs, "svg_id"),
      };
    case "group":
      return {
        type, ...carrier, ...parseCommon(attrs),
        isSavedInLib: bool(attrs, "isSavedInLib"),
        scaleX: num(attrs, "scaleX", 1),
        scaleY: num(attrs, "scaleY", 1),
        items: childItems(node).map(parseItem),
      };
    case "filter":
      return {
        type, ...carrier,
        filterid: num(attrs, "filterid"),
        opacity: num(attrs, "opacity", 1),
        adjBrightness: num(attrs, "adj_brightness"),
        adjContrast: num(attrs, "adj_contrast"),
        adjSaturation: num(attrs, "adj_saturation"),
        adjHue: num(attrs, "adj_hue"),
        adjWarmth: num(attrs, "adj_warmth"),
        adjVignette: num(attrs, "adj_vignette"),
      };
    default:
      // Unknown item type: keep raw for round-trip; model as clipart-ish carrier.
      return {
        type: type as any, ...carrier, ...parseCommon(attrs),
        source: str(attrs, "source"),
        sourceSvg: str(attrs, "source_svg"),
        colors: [],
        swfId: str(attrs, "swf_id"),
        svgId: str(attrs, "svg_id"),
      } as Item;
  }
}

export function parse(xml: string): Design {
  const root = parser.parse(xml);
  const dataNode = root.data;
  if (!dataNode) throw new Error("parse: missing <data> root element");

  const attrs = getAttrs(dataNode);
  const carrier = rawCarrier(attrs, DATA_KNOWN);

  return {
    ...carrier,
    templateType: str(attrs, "template_type"),
    patternIndex: num(attrs, "pattern_index"),
    bgColor: num(attrs, "bg_color"),
    borderColor: num(attrs, "border_color"),
    borderWidth: num(attrs, "border_width"),
    isLinear: bool(attrs, "is_linear"),
    isReverse: bool(attrs, "is_reverse"),
    grad1: num(attrs, "grad1"),
    grad2: num(attrs, "grad2"),
    ratio1: num(attrs, "ratio1"),
    ratio2: num(attrs, "ratio2", 255),
    angle: num(attrs, "angle"),
    bgType: str(attrs, "bg_type", "color"),
    transparent: bool(attrs, "transparent"),
    patternColor: str(attrs, "pattern_color"),
    canvasWidth: num(attrs, "canvas_width"),
    canvasHeight: num(attrs, "canvas_height"),
    dpi: num(attrs, "dpi"),
    // Preserve document order here; the renderer sorts by index for display.
    items: childItems(dataNode).map(parseItem),
  };
}
