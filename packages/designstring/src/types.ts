// Typed model for the legacy Youzign "designstring" XML format.
//
// Forward-compat contract: every parsed node carries `rawAttrs` (all attributes
// as their original string values, in document order via `attrOrder`). Typed
// fields are derived views; serialization is driven from rawAttrs so that
// parse(serialize(parse(xml))) deep-equals parse(xml) for known AND unknown
// attributes. `extraAttrs` exposes attributes not in the known set for the type.

export type ItemType =
  | "image"
  | "text"
  | "text-curved"
  | "clipart"
  | "group"
  | "filter";

export interface RawCarrier {
  /** All attributes, original string values, keyed by name. */
  rawAttrs: Record<string, string>;
  /** Attribute names in document order (for stable serialization). */
  attrOrder: string[];
  /** Attributes not recognized for this node type (forward-compat bag). */
  extraAttrs: Record<string, string>;
}

export interface CommonItemFields {
  index: number;
  xpos: number;
  ypos: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  hFlip: boolean;
  vFlip: boolean;
  shadowDistance: number;
  shadowAngle: number;
  shadowColor: number;
  shadowOpacity: number;
  isShadow: boolean;
  isBorder: boolean;
  borderSize: number;
  borderColor: number;
  isBlur: boolean;
  blurSize: number;
}

export interface ImageItem extends RawCarrier, CommonItemFields {
  type: "image";
  source: string;
  color: string;
  canBeCropped: boolean;
  cropped: boolean;
  pixabay: boolean;
}

export interface TextFields {
  content: string; // CDATA
  font: string;
  fontType: string;
  strikethrough: boolean;
  size: number;
  /** per-glyph signed-int colors (one token per char) */
  colors: number[];
  alignment: "left" | "center" | "right" | string;
  scalex: number;
  scaley: number;
  wrapping: boolean;
  scaleUsed: boolean;
  textAreaWidth: number;
  textAreaHeight: number;
  mcWidth: number;
  mcHeight: number;
  textAreaxpos: number;
  textAreaypos: number;
  bold: boolean;
  italic: boolean;
  isNoFill: boolean;
  underline: boolean;
}

export interface TextItem extends RawCarrier, CommonItemFields, TextFields {
  type: "text";
}

export interface TextCurvedItem
  extends RawCarrier,
    CommonItemFields,
    TextFields {
  type: "text-curved";
  startAngle: number;
  endAngle: number;
  radius: number;
  topDirection: boolean;
  useLetterAngle: boolean;
}

export interface ClipartItem extends RawCarrier, CommonItemFields {
  type: "clipart";
  source: string;
  sourceSvg: string;
  /** per-token signed-int colors */
  colors: number[];
  swfId: string;
  svgId: string;
}

export interface GroupItem extends RawCarrier, CommonItemFields {
  type: "group";
  isSavedInLib: boolean;
  scaleX: number;
  scaleY: number;
  items: Item[];
}

export interface FilterItem extends RawCarrier {
  type: "filter";
  filterid: number;
  opacity: number;
}

export type Item =
  | ImageItem
  | TextItem
  | TextCurvedItem
  | ClipartItem
  | GroupItem
  | FilterItem;

export interface Design extends RawCarrier {
  templateType: string;
  patternIndex: number;
  bgColor: number;
  borderColor: number;
  borderWidth: number;
  isLinear: boolean;
  isReverse: boolean;
  grad1: number;
  grad2: number;
  ratio1: number;
  ratio2: number;
  angle: number;
  bgType: "color" | "gradient" | "pattern" | "image" | string;
  transparent: boolean;
  patternColor: string;
  canvasWidth: number;
  canvasHeight: number;
  dpi: number;
  items: Item[];
}
