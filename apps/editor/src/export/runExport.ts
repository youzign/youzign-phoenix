import { toPng, toJpeg } from "html-to-image";
import jsPDF from "jspdf";
import {
  JPG_QUALITY,
  exportFilename,
  pdfLayout,
  type ExportFormat,
  type ExportScale,
} from "./exportMath.js";

export interface ExportOptions {
  format: ExportFormat;
  scale: ExportScale;
  /** PNG only: export without the canvas background layer. */
  transparent: boolean;
  designName: string;
  canvasWidth: number;
  canvasHeight: number;
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

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/**
 * Capture the live `.yz-canvas` node and download it in the requested format.
 * Returns the produced data URL (handy for tests / verification).
 */
export async function runExport(opts: ExportOptions): Promise<string | null> {
  const node = document.querySelector<HTMLElement>(".yz-canvas");
  if (!node) return null;

  const { format, scale, transparent, canvasWidth, canvasHeight } = opts;
  const filename = exportFilename(opts.designName, format);
  const style = captureStyle(transparent, format);

  const base = {
    width: canvasWidth,
    height: canvasHeight,
    pixelRatio: scale,
    style,
  };

  if (format === "png") {
    const url = await toPng(node, base);
    triggerDownload(url, filename);
    return url;
  }

  if (format === "jpg") {
    const url = await toJpeg(node, { ...base, quality: JPG_QUALITY });
    triggerDownload(url, filename);
    return url;
  }

  // PDF: render a high-res JPEG, place it full-bleed on an auto-oriented page.
  const url = await toJpeg(node, { ...base, quality: JPG_QUALITY });
  const layout = pdfLayout(canvasWidth, canvasHeight);
  const pdf = new jsPDF({
    orientation: layout.orientation,
    unit: layout.unit,
    format: layout.format,
    compress: true,
  });
  pdf.addImage(url, "JPEG", 0, 0, layout.imageWidth, layout.imageHeight);
  pdf.save(filename);
  return url;
}
