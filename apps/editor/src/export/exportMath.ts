/* ------------------------------------------------------------------ *
 * Pure export logic — scale math, PDF page layout, filename.
 * No DOM / no side-effects → unit-testable in isolation.
 * ------------------------------------------------------------------ */

export type ExportFormat = "png" | "jpg" | "pdf";
export type ExportScale = 1 | 2 | 3 | 4 | 5;

/** Legacy Youzign exported JPEGs at 0.95 quality. */
export const JPG_QUALITY = 0.95;

export const EXPORT_SCALES: ExportScale[] = [1, 2, 3, 4, 5];

/** File extension for a format (jpg, not jpeg — matching legacy downloads). */
export function extensionFor(format: ExportFormat): string {
  return format === "jpg" ? "jpg" : format;
}

/** `<design name>.<ext>`, falling back to "design" for blank names. */
export function exportFilename(name: string, format: ExportFormat): string {
  const base = (name ?? "").trim() || "design";
  return `${base}.${extensionFor(format)}`;
}

/** Output pixel dimensions after applying an integer pixelRatio scale. */
export function scaledDimensions(
  width: number,
  height: number,
  scale: ExportScale
): { width: number; height: number } {
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/**
 * PDF page layout mirroring legacy SaveProject: a single full-bleed page
 * sized to the canvas (px units), auto-oriented from the aspect ratio.
 * Square canvases default to portrait (jsPDF's own default).
 */
export function pdfLayout(
  width: number,
  height: number
): {
  orientation: "portrait" | "landscape";
  unit: "px";
  format: [number, number];
  imageWidth: number;
  imageHeight: number;
} {
  const orientation = width > height ? "landscape" : "portrait";
  return {
    orientation,
    unit: "px",
    // jsPDF expects the format in the page's natural (portrait) order:
    // [short, long]. It swaps internally for landscape.
    format:
      orientation === "landscape" ? [height, width] : [width, height],
    imageWidth: width,
    imageHeight: height,
  };
}
