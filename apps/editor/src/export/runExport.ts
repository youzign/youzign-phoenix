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
import { ensureExportImages } from "./exportReadiness.js";

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

async function ensureExportFonts(nodes: HTMLElement[]): Promise<void> {
  const fonts = (document as unknown as { fonts?: FontFaceSet }).fonts;
  if (!fonts?.load) return;

  const specs = new Set<string>();
  for (const node of nodes) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode;
      if (!text.textContent?.trim()) continue;
      const element = text.parentElement;
      if (!element) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (!style.fontFamily || !style.fontSize || style.fontSize === "0px") continue;
      specs.add(
        `${style.fontStyle || "normal"} ${style.fontWeight || "400"} ${style.fontSize} ${style.fontFamily}`
      );
    }
  }

  await Promise.all([...specs].map((spec) => fonts.load(spec).catch(() => null)));
  await fonts.ready;
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
  const captureNodes = indices.map((index) => ({ index, node: exportNode(index) }));
  const nodes = captureNodes
    .map((entry) => entry.node)
    .filter((node): node is HTMLElement => !!node);

  await ensureExportImages(nodes);
  await ensureExportFonts(nodes);

  const capture = async (
    entry: { index: number | undefined; node: HTMLElement | null },
    fmt: "png" | "jpg"
  ) => {
    const { index, node } = entry;
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
    for (const entry of captureNodes) {
      const index = entry.index;
      const url = await capture(entry, "png");
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
    for (const entry of captureNodes) {
      const index = entry.index;
      const url = await capture(entry, "jpg");
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
  for (let i = 0; i < captureNodes.length; i++) {
    const entry = captureNodes[i];
    const index = entry.index;
    const page = index === undefined ? undefined : opts.pages?.[index];
    const width = page?.canvasWidth ?? canvasWidth;
    const height = page?.canvasHeight ?? canvasHeight;
    const url = await capture(entry, "jpg");
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
