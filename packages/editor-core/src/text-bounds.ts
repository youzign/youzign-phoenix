import { textScale as sharedTextScale, textOrigin } from "@youzign/designstring";
import type { CommonItemFields, TextFields } from "@youzign/designstring";
import type { SelBox } from "./geometry.js";

export interface TextMeasureResult {
  width: number;
  actualBoundingBoxLeft?: number;
  actualBoundingBoxRight?: number;
  actualBoundingBoxAscent?: number;
  actualBoundingBoxDescent?: number;
}

export type TextMeasurer = (text: string, font: string) => TextMeasureResult;

export function textFontCss(item: Pick<TextFields, "italic" | "bold" | "size" | "font">): string {
  const style = item.italic ? "italic " : "";
  const weight = item.bold ? "700 " : "400 ";
  return `${style}${weight}${item.size}px "${item.font}", sans-serif`;
}

let sharedCanvasContext: CanvasRenderingContext2D | null | undefined;

function fallbackMeasure(text: string, font: string): TextMeasureResult {
  if (typeof document === "undefined") {
    const size = Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 16);
    return {
      width: Array.from(text).length * size * 0.6,
      actualBoundingBoxAscent: size * 0.8,
      actualBoundingBoxDescent: size * 0.2,
    };
  }
  if (sharedCanvasContext === undefined) {
    sharedCanvasContext = document.createElement("canvas").getContext("2d");
  }
  const ctx = sharedCanvasContext;
  if (!ctx) return { width: 0 };
  ctx.font = font;
  return ctx.measureText(text);
}

function splitWrappedLine(line: string, maxWidth: number, measure: (s: string) => number): string[] {
  if (maxWidth <= 0 || measure(line) <= maxWidth) return [line];
  const out: string[] = [];
  let current = "";
  for (const token of line.split(/(\s+)/)) {
    const next = current + token;
    if (current && measure(next) > maxWidth) {
      out.push(current.trimEnd());
      current = token.trimStart();
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out.length ? out : [line];
}

function rotate(x: number, y: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

export function textMatrixCenter(
  item: CommonItemFields & TextFields,
  left: number,
  top: number,
  localCx: number,
  localCy: number,
  sx: number,
  sy: number
) {
  const r = rotate(localCx * sx, localCy * sy, item.rotation);
  return { cx: left + r.x, cy: top + r.y };
}

function textScale(item: CommonItemFields & TextFields) {
  // Shared AABB-aware reconstruction so the selection chrome matches the
  // renderer for rotated legacy text; identical to mc/textArea at θ=0.
  return sharedTextScale(item);
}

export function wrappedTextLines(
  item: CommonItemFields & TextFields,
  measurer: TextMeasurer = fallbackMeasure
): string[] {
  const font = textFontCss(item);
  const measure = (text: string) => measurer(text || " ", font);
  const rawLines = (item.content || " ").split(/\r?\n/);
  return rawLines.flatMap((line) =>
    item.wrapping
      ? splitWrappedLine(line || " ", item.textAreaWidth, (s) => measure(s).width)
      : [line || " "]
  );
}

export function derivedTextAreaHeight(
  item: CommonItemFields & TextFields,
  measurer: TextMeasurer = fallbackMeasure
): number {
  const font = textFontCss(item);
  const lines = wrappedTextLines(item, measurer);
  const lineHeight = Math.max(1, item.size * 1.2);
  let glyphHeight = item.size;
  for (const line of lines) {
    const m = measurer(line || " ", font);
    glyphHeight = Math.max(
      glyphHeight,
      (m.actualBoundingBoxAscent ?? item.size * 0.8) +
        (m.actualBoundingBoxDescent ?? item.size * 0.2)
    );
  }
  return Math.max(glyphHeight, lines.length * lineHeight);
}

function measuredTextLocalBounds(
  item: CommonItemFields & TextFields,
  measurer: TextMeasurer = fallbackMeasure
): { localCx: number; localCy: number; w: number; h: number } {
  const { sx, sy } = textScale(item);
  if (item.wrapping) {
    return {
      localCx: item.textAreaWidth / 2,
      localCy: item.textAreaHeight / 2,
      // True (unrotated) local box = scale × text area. Equals mcWidth/mcHeight
      // at θ=0; for rotated legacy text mc is the AABB, not this box, so derive
      // from the reconstructed scale instead.
      w: item.textAreaWidth * sx || item.mcWidth,
      h: item.textAreaHeight * sy || item.mcHeight,
    };
  }

  const font = textFontCss(item);
  const measure = (text: string) => measurer(text || " ", font);
  const lines = wrappedTextLines(item, measurer);
  const lineHeight = lines.length > 1 || item.wrapping
    ? Math.max(item.size * 1.2, item.textAreaHeight / Math.max(1, lines.length))
    : item.textAreaHeight;
  const blockHeight = lines.length * lineHeight;
  const blockTop = lines.length > 1 || item.wrapping
    ? Math.max(0, (item.textAreaHeight - blockHeight) / 2)
    : 0;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  lines.forEach((line, index) => {
    const m = measure(line);
    const textWidth =
      m.actualBoundingBoxLeft !== undefined && m.actualBoundingBoxRight !== undefined
        ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight
        : m.width;
    const ascent = m.actualBoundingBoxAscent ?? item.size * 0.8;
    const descent = m.actualBoundingBoxDescent ?? item.size * 0.2;
    const alignSpace = Math.max(0, item.textAreaWidth - m.width);
    const alignOffset =
      item.alignment === "right" ? alignSpace : item.alignment === "center" ? alignSpace / 2 : 0;
    const glyphLeft = alignOffset - (m.actualBoundingBoxLeft ?? 0);
    const baseline = blockTop + index * lineHeight + (lineHeight + ascent - descent) / 2;
    minX = Math.min(minX, glyphLeft);
    maxX = Math.max(maxX, glyphLeft + textWidth);
    minY = Math.min(minY, baseline - ascent);
    maxY = Math.max(maxY, baseline + descent);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { localCx: 0, localCy: 0, w: 0, h: 0 };
  }

  return {
    localCx: (minX + maxX) / 2,
    localCy: (minY + maxY) / 2,
    w: Math.max(1, (maxX - minX) * sx),
    h: Math.max(1, (maxY - minY) * sy),
  };
}

export function textMatrixCenterOffset(
  item: CommonItemFields & TextFields,
  measurer: TextMeasurer = fallbackMeasure
): { x: number; y: number } {
  const { sx, sy } = textScale(item);
  const bounds = measuredTextLocalBounds(item, measurer);
  return { x: bounds.localCx * sx, y: bounds.localCy * sy };
}

export function measuredTextBox(
  item: CommonItemFields & TextFields,
  measurer: TextMeasurer = fallbackMeasure
): SelBox {
  const { sx, sy, left, top } = textOrigin(item);
  const bounds = measuredTextLocalBounds(item, measurer);
  return {
    ...textMatrixCenter(item, left, top, bounds.localCx, bounds.localCy, sx, sy),
    w: bounds.w,
    h: bounds.h,
    rotation: item.rotation,
  };
}
