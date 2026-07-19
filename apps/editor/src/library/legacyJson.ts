// Converts late-era (2020–2025) Youzign v3 designs — stored as JSON
// ({"canvasData":{…},"pageItems":[…]}) — into the legacy "designstring" XML
// that packages/designstring parses and packages/renderer renders.
//
// The JSON model mirrors the XML model field-for-field; the differences this
// module reconciles are:
//   • attribute names: JSON camelCase → XML snake_case (template_type, bg_color…)
//   • colors: JSON "#rrggbb" strings → XML signed 24-bit decimal ints
//   • text/clipart color: JSON single string / {index:hex} object → XML "@@@"
//     per-glyph / per-token string
//   • bgType "gradcolor" → XML bg_type "gradient" (what backgroundCss expects)
//   • booleans → "true"/"false"; content wrapped in CDATA
//
//   • geometry: the per-item `matrix` {a,b,c,d,x,y} is the AUTHORITATIVE
//     transform in the JSON era. The redundant fields are frequently stale
//     (e.g. xpos/ypos = 0, mcWidth ≈ garbage) and stored width/height are the
//     PRE-matrix local size — so on-canvas geometry is reconstructed from the
//     matrix: scale = (hypot(a,b), hypot(c,d)), rotation = atan2(b,a), and
//     image/clipart center = M·(w/2,h/2) + (x,y); text top-left = (x,y) with
//     scale expressed through mcWidth/mcHeight = scale × textArea size (the
//     ratio the XML renderer's textPlacement applies).
//
// Deliberately DROPPED (no XML equivalent, and not rendered): editor-only
// `id`/`isLocked`/`isBackground`, the canvas-level `filter`/`filterAlpha`
// (instagram-style whole-canvas filter — the XML model has no equivalent and
// the renderer's <filter> item is a no-op), and `patternColors` (pattern
// backgrounds render as a solid fill in the renderer). Non-uniform
// scale+rotation matrices (shear) are approximated by their axis scales and
// rotation angle. Image/clipart `source` URLs are preserved verbatim for the
// downstream rewrite + inline pipeline.
//
// Pure and I/O-free — unit-testable in isolation.

type Json = Record<string, unknown>;

const bstr = (v: unknown): string => (v ? "true" : "false");

function numstr(v: unknown, fallback = 0): string {
  const n = typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v);
  return String(Number.isFinite(n) ? n : fallback);
}

/** Tolerant "#rrggbb"/"#rgb" → signed 24-bit int; unparseable (e.g. "gray") → 0. */
function hexToInt(v: unknown, fallback = 0): number {
  if (typeof v !== "string") return fallback;
  let h = v.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return r * 65536 + g * 256 + b;
}

/** JSON clipart `colors` object {"0":"#..","1":".."} → "int@@@int" (key order). */
function clipartColorTokens(colors: unknown): string {
  if (!colors || typeof colors !== "object") return "";
  const entries = Object.entries(colors as Record<string, unknown>)
    .map(([k, val]) => [Number(k), val] as const)
    .sort((a, b) => a[0] - b[0]);
  return entries.map(([, val]) => String(hexToInt(val))).join("@@@");
}

function escapeAttr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape a CDATA payload: only "]]>" can terminate a CDATA section. */
function escapeCData(v: string): string {
  return v.split("]]>").join("]]]]><![CDATA[>");
}

type Attr = [string, string];

function renderAttrs(attrs: Attr[]): string {
  return attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join("");
}

// ---- matrix geometry ----
//
// JSON-era items carry an affine transform {a,b,c,d,x,y} mapping the item's
// LOCAL box (0,0,width,height) — or (0,0,textAreaWidth,textAreaHeight) for
// text — onto the canvas. It is the source of truth: the sibling
// xpos/ypos/width/mcWidth fields are often stale (real data has xpos=0 with a
// matrix translate of 750, and mcWidth values unrelated to the actual scale).

interface Matrix2D {
  a: number;
  b: number;
  c: number;
  d: number;
  x: number;
  y: number;
}

function readMatrix(v: unknown): Matrix2D | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  const nums = [m.a, m.b ?? 0, m.c ?? 0, m.d, m.x ?? 0, m.y ?? 0].map(Number);
  if (!nums.every(Number.isFinite)) return null;
  const [a, b, c, d, x, y] = nums;
  return { a, b, c, d, x, y };
}

interface PlacedBox {
  /** on-canvas center */
  cx: number;
  cy: number;
  /** on-canvas (post-scale) size */
  width: number;
  height: number;
  /** degrees */
  rotation: number;
  /** axis scales */
  sx: number;
  sy: number;
}

/** Place a local (0,0,w,h) box through the matrix; rotation about the center. */
function placeBox(m: Matrix2D, w: number, h: number): PlacedBox {
  const sx = Math.hypot(m.a, m.b);
  const sy = Math.hypot(m.c, m.d);
  const rotation = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  return {
    // The transformed center of the local box; XML rotation pivots on the
    // center, so mapping centers is exact for rotate+scale matrices.
    cx: m.x + (m.a * w) / 2 + (m.c * h) / 2,
    cy: m.y + (m.b * w) / 2 + (m.d * h) / 2,
    width: w * sx,
    height: h * sy,
    rotation,
    sx,
    sy,
  };
}

interface GeometryOverride {
  xpos?: number;
  ypos?: number;
  width?: number;
  height?: number;
  rotation?: number;
}

function commonItemAttrs(it: Json, geo: GeometryOverride = {}): Attr[] {
  return [
    ["type", String(it.type)],
    ["index", numstr(it.index)],
    ["xpos", geo.xpos !== undefined ? String(geo.xpos) : numstr(it.xpos)],
    ["ypos", geo.ypos !== undefined ? String(geo.ypos) : numstr(it.ypos)],
    ["width", geo.width !== undefined ? String(geo.width) : numstr(it.width)],
    ["height", geo.height !== undefined ? String(geo.height) : numstr(it.height)],
    ["rotation", geo.rotation !== undefined ? String(geo.rotation) : numstr(it.rotation)],
    ["opacity", numstr(it.opacity, 1)],
    ["hFlip", bstr(it.hFlip)],
    ["vFlip", bstr(it.vFlip)],
    ["shadow_distance", numstr(it.shadowDistance)],
    ["shadow_angle", numstr(it.shadowAngle)],
    ["shadow_color", String(hexToInt(it.shadowColor))],
    ["shadow_opacity", numstr(it.shadowOpacity)],
    ["is_shadow", bstr(it.isShadow)],
    ["is_border", bstr(it.isBorder)],
    ["border_size", numstr(it.borderSize)],
    ["border_color", String(hexToInt(it.borderColor))],
    ["is_blur", bstr(it.isBlur)],
    ["blur_size", numstr(it.blurSize)],
    ["blendMode", it.blendMode ? String(it.blendMode) : "normal"],
    ["isInvert", bstr(it.isInvert)],
    ["invertIntensity", numstr(it.invertIntensity, 100)],
  ];
}

/**
 * Geometry for box items (image/clipart): stored width/height are the
 * PRE-matrix local size and stored xpos/ypos are often stale — derive the
 * on-canvas center/size/rotation from the matrix when present.
 */
function boxGeometry(it: Json): GeometryOverride {
  const m = readMatrix(it.matrix);
  const w = Number(it.width);
  const h = Number(it.height);
  if (!m || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return {};
  const p = placeBox(m, w, h);
  return { xpos: p.cx, ypos: p.cy, width: p.width, height: p.height, rotation: p.rotation };
}

function imageItemXml(it: Json): string {
  const attrs: Attr[] = [
    ...commonItemAttrs(it, boxGeometry(it)),
    ["source", it.source == null ? "" : String(it.source)],
    ["color", it.color == null ? "" : String(it.color)],
    ["canBeCropped", bstr(it.canBeCropped)],
    ["cropped", bstr(it.cropped)],
    ["pixabay", bstr(it.pixabay)],
    ["isCornerRadiusIndividual", bstr(it.isCornerRadiusIndividual)],
    ["inputCornerTopLeft", numstr(it.inputCornerTopLeft)],
    ["inputCornerTopRight", numstr(it.inputCornerTopRight)],
    ["inputCornerBottomLeft", numstr(it.inputCornerBottomLeft)],
    ["inputCornerBottomRight", numstr(it.inputCornerBottomRight)],
  ];
  return `  <item${renderAttrs(attrs)}/>`;
}

function clipartItemXml(it: Json): string {
  const attrs: Attr[] = [
    ...commonItemAttrs(it, boxGeometry(it)),
    ["source", it.source == null ? "" : String(it.source)],
    ["source_svg", ""],
    ["color", clipartColorTokens(it.colors)],
    ["swf_id", ""],
    ["svg_id", ""],
  ];
  return `  <item${renderAttrs(attrs)}/>`;
}

/**
 * Geometry for text items. The JSON matrix maps the local
 * (0,0,textAreaWidth,textAreaHeight) box onto the canvas. The XML renderer
 * (and the editor's selection box / text-bounds) compute
 *   sx = mcWidth / textAreaWidth, left = xpos + textAreaxpos·sx
 * so we express the matrix scale through mcWidth/mcHeight and anchor
 * xpos/ypos so that left/top land exactly on the matrix translate. The
 * sibling stored xpos/mcWidth values are frequently stale garbage (e.g.
 * mcWidth ≈ canvas width regardless of the text) and must not be trusted.
 */
function textGeometry(it: Json): {
  geo: GeometryOverride;
  mcWidth: string;
  mcHeight: string;
  taxpos: string;
  taypos: string;
} {
  const fallback = {
    geo: {},
    mcWidth: numstr(it.mcWidth),
    mcHeight: numstr(it.mcHeight),
    taxpos: numstr(it.textAreaxpos),
    taypos: numstr(it.textAreaypos),
  };
  const m = readMatrix(it.matrix);
  const taW = Number(it.textAreaWidth);
  const taH = Number(it.textAreaHeight);
  if (!m || !Number.isFinite(taW) || !Number.isFinite(taH) || taW <= 0 || taH <= 0) {
    return fallback;
  }
  const p = placeBox(m, taW, taH);
  return {
    geo: {
      // left = xpos + taxpos·sx must equal matrix.x (and same for top).
      xpos: m.x + (p.sx * taW) / 2,
      ypos: m.y + (p.sy * taH) / 2,
      rotation: p.rotation,
    },
    mcWidth: String(p.sx * taW),
    mcHeight: String(p.sy * taH),
    taxpos: String(-taW / 2),
    taypos: String(-taH / 2),
  };
}

function textItemXml(it: Json): string {
  // XML text color is per-glyph ("@@@"-joined). A single token is applied to
  // every glyph by the renderer's buildRuns, so one token is faithful and
  // compact.
  const g = textGeometry(it);
  const attrs: Attr[] = [
    ...commonItemAttrs(it, g.geo),
    ["font", it.font == null ? "" : String(it.font)],
    ["fontType", it.fontType == null ? "External Font" : String(it.fontType)],
    ["strikethrough", bstr(it.strikethrough)],
    ["size", numstr(it.size)],
    ["color", String(hexToInt(it.color))],
    ["alignment", it.alignment == null ? "left" : String(it.alignment)],
    ["scalex", numstr(it.scalex, 1)],
    ["scaley", numstr(it.scaley, 1)],
    ["wrapping", bstr(it.wrapping)],
    ["scaleUsed", bstr(it.scaleUsed)],
    ["textAreaWidth", numstr(it.textAreaWidth)],
    ["textAreaHeight", numstr(it.textAreaHeight)],
    ["mcWidth", g.mcWidth],
    ["mcHeight", g.mcHeight],
    ["textAreaxpos", g.taxpos],
    ["textAreaypos", g.taypos],
    ["bold", bstr(it.bold)],
    ["italic", bstr(it.italic)],
    ["isNoFill", bstr(it.isNoFill)],
    ["underline", bstr(it.underline)],
  ];
  const content = it.content == null ? "" : String(it.content);
  return `  <item${renderAttrs(attrs)}><![CDATA[${escapeCData(content)}]]></item>`;
}

function itemXml(it: Json): string | null {
  switch (it.type) {
    case "image":
      return imageItemXml(it);
    case "clipart":
      return clipartItemXml(it);
    case "text":
      return textItemXml(it);
    default:
      // Unknown item type (none occur in the 190 real designs): skip rather
      // than emit something the renderer can't place.
      return null;
  }
}

/** JSON bgType → XML bg_type. "gradcolor" is the JSON spelling of "gradient". */
function mapBgType(v: unknown): string {
  const s = v == null ? "color" : String(v);
  return s === "gradcolor" ? "gradient" : s;
}

/**
 * Convert a legacy v3 JSON design string into designstring XML.
 * @throws if the input is not the expected {canvasData, pageItems} shape.
 */
export function convertLegacyJsonDesign(json: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("convertLegacyJsonDesign: input is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("convertLegacyJsonDesign: expected an object");
  }
  const root = parsed as Json;
  const cd = (root.canvasData ?? {}) as Json;
  if (!root.canvasData || typeof root.canvasData !== "object") {
    throw new Error("convertLegacyJsonDesign: missing canvasData");
  }

  const dataAttrs: Attr[] = [
    ["template_type", cd.templateType == null ? "" : String(cd.templateType)],
    ["pattern_index", numstr(cd.patternIndex)],
    ["bg_color", String(hexToInt(cd.bgColor))],
    ["border_color", String(hexToInt(cd.borderColor))],
    ["border_width", numstr(cd.borderWidth)],
    ["is_linear", bstr(cd.isLinear)],
    ["is_reverse", bstr(cd.isReverse)],
    ["grad1", String(hexToInt(cd.grad1))],
    ["grad2", String(hexToInt(cd.grad2))],
    ["ratio1", numstr(cd.ratio1)],
    ["ratio2", numstr(cd.ratio2, 255)],
    ["angle", numstr(cd.angle)],
    ["bg_type", mapBgType(cd.bgType)],
    ["transparent", bstr(cd.transparent)],
    ["pattern_color", ""],
    ["canvas_width", numstr(cd.width)],
    ["canvas_height", numstr(cd.height)],
    ["dpi", numstr(cd.dpi)],
  ];

  const rawItems = Array.isArray(root.pageItems) ? (root.pageItems as Json[]) : [];
  const items = [...rawItems]
    .sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0))
    .map(itemXml)
    .filter((x): x is string => x !== null);

  const body = items.length ? `\n${items.join("\n")}\n` : "\n";
  return `<?xml version="1.0" encoding="utf-8"?>\n<data${renderAttrs(dataAttrs)}>${body}</data>\n`;
}
