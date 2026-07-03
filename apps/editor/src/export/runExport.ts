import { toPng, toJpeg } from "html-to-image";
import jsPDF from "jspdf";
import {
  JPG_QUALITY,
  exportPageFilename,
  exportFilename,
  pdfLayout,
  type ExportFormat,
  type ExportScale,
} from "./exportMath.js";
import { saveBytes, saveDataUrl } from "../native.js";

export interface ExportOptions {
  format: ExportFormat;
  scale: ExportScale;
  /** PNG only: export without the canvas background layer. */
  transparent: boolean;
  designName: string;
  canvasWidth: number;
  canvasHeight: number;
  pages?: { canvasWidth: number; canvasHeight: number }[];
  pageIndices?: number[];
}

/** Style overrides applied to the cloned capture root by html-to-image. */
function captureStyle(transparent: boolean, format: ExportFormat) {
  const style: Record<string, string> = { transform: "none" };
  // The `.yz-canvas` node carries the background (color / gradient) itself.
  // For a transparent PNG we blank it on the clone so only the items render.
  if (transparent && format === "png") {
    style.background = "none";
    style.backgroundColor = "transparent";
    style.backgroundImage = "none";
  }
  return style;
}

function exportNode(index?: number): HTMLElement | null {
  if (index === undefined) return document.querySelector<HTMLElement>(".yz-canvas");
  return document.querySelector<HTMLElement>(
    `[data-export-page="${index}"] .yz-canvas`
  );
}

/**
 * Capture the live `.yz-canvas` node and download it in the requested format.
 * Returns the produced data URL (handy for tests / verification).
 */
export async function runExport(opts: ExportOptions): Promise<string | null> {
  const { format, scale, transparent, canvasWidth, canvasHeight } = opts;
  const indices = opts.pageIndices?.length ? opts.pageIndices : [undefined];
  const filename = exportFilename(opts.designName, format);
  const style = captureStyle(transparent, format);

  const capture = async (index: number | undefined, fmt: "png" | "jpg") => {
    const node = exportNode(index);
    if (!node) return null;
    const page = index === undefined ? undefined : opts.pages?.[index];
    const width = page?.canvasWidth ?? canvasWidth;
    const height = page?.canvasHeight ?? canvasHeight;
    const base = { width, height, pixelRatio: scale, style };
    return fmt === "png"
      ? toPng(node, base)
      : toJpeg(node, { ...base, quality: JPG_QUALITY });
  };

  if (format === "png") {
    let first: string | null = null;
    for (const index of indices) {
      const url = await capture(index, "png");
      if (!url) continue;
      if (!first) first = url;
      await saveDataUrl(
        url,
        index === undefined ? filename : exportPageFilename(opts.designName, format, index + 1)
      );
    }
    return first;
  }

  if (format === "jpg") {
    let first: string | null = null;
    for (const index of indices) {
      const url = await capture(index, "jpg");
      if (!url) continue;
      if (!first) first = url;
      await saveDataUrl(
        url,
        index === undefined ? filename : exportPageFilename(opts.designName, format, index + 1)
      );
    }
    return first;
  }

  const firstIndex = indices[0];
  const firstPage = firstIndex === undefined ? undefined : opts.pages?.[firstIndex];
  const firstLayout = pdfLayout(firstPage?.canvasWidth ?? canvasWidth, firstPage?.canvasHeight ?? canvasHeight);
  const pdf = new jsPDF({ orientation: firstLayout.orientation, unit: firstLayout.unit, format: firstLayout.format, compress: true });
  let firstUrl: string | null = null;
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i];
    const page = index === undefined ? undefined : opts.pages?.[index];
    const width = page?.canvasWidth ?? canvasWidth;
    const height = page?.canvasHeight ?? canvasHeight;
    const url = await capture(index, "jpg");
    if (!url) continue;
    if (!firstUrl) firstUrl = url;
    const layout = pdfLayout(width, height);
    if (i > 0) pdf.addPage(layout.format, layout.orientation);
    pdf.addImage(url, "JPEG", 0, 0, layout.imageWidth, layout.imageHeight);
  }
  const bytes = new Uint8Array(pdf.output("arraybuffer"));
  await saveBytes(bytes, filename);
  (window as any).__lastPdfExport = bytes.buffer;
  return firstUrl;
}
