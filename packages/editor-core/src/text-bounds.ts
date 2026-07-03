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

function fallbackMeasure(text: string, font: string): TextMeasureResult {
  if (typeof document === "undefined") {
    const size = Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 16);
    return {
      width: Array.from(text).length * size * 0.6,
      actualBoundingBoxAscent: size * 0.8,
      actualBoundingBoxDescent: size * 0.2,
    };
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
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

export function measuredTextBox(
  item: CommonItemFields & TextFields,
  measurer: TextMeasurer = fallbackMeasure
): SelBox {
  const sx = item.textAreaWidth ? item.mcWidth / item.textAreaWidth : 1;
  const sy = item.textAreaHeight ? item.mcHeight / item.textAreaHeight : 1;
  const left = item.xpos + item.textAreaxpos * sx;
  const top = item.ypos + item.textAreaypos * sy;
  const font = textFontCss(item);
  const measure = (text: string) => measurer(text || " ", font);
  const rawLines = (item.content || " ").split(/\r?\n/);
  const lines = rawLines.flatMap((line) =>
    item.wrapping ? splitWrappedLine(line || " ", item.textAreaWidth, (s) => measure(s).width) : [line || " "]
  );
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
    return { cx: left, cy: top, w: 0, h: 0, rotation: item.rotation };
  }

  const w = Math.max(1, (maxX - minX) * sx);
  const h = Math.max(1, (maxY - minY) * sy);
  return {
    cx: left + ((minX + maxX) / 2) * sx,
    cy: top + ((minY + maxY) / 2) * sy,
    w,
    h,
    rotation: item.rotation,
  };
}
