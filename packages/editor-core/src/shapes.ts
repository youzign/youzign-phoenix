// Parametric SVG shapes, insertable into a design as clipart items whose
// `source` is an inline SVG data-URI. This keeps the designstring model valid
// (a clipart node with a `source`) while requiring no renderer changes: the
// renderer's ClipartItemView treats a non-".svg" URL as an image and renders
// the data-URI via <img>. Recoloring regenerates the data-URI (see mutations).

export type ShapeKind = "rect" | "ellipse" | "triangle" | "star" | "arrow" | "line";

export const SHAPE_KINDS: ShapeKind[] = [
  "rect",
  "ellipse",
  "triangle",
  "star",
  "arrow",
  "line",
];

/** SVG inner body for a shape, drawn in a 0 0 100 100 viewBox. */
function shapeBody(kind: ShapeKind, fill: string): string {
  switch (kind) {
    case "rect":
      return `<rect x="4" y="4" width="92" height="92" rx="4" fill="${fill}"/>`;
    case "ellipse":
      return `<ellipse cx="50" cy="50" rx="47" ry="47" fill="${fill}"/>`;
    case "triangle":
      return `<polygon points="50,4 96,96 4,96" fill="${fill}"/>`;
    case "star":
      return `<polygon points="50,3 61,38 98,38 68,60 79,96 50,73 21,96 32,60 2,38 39,38" fill="${fill}"/>`;
    case "arrow":
      return `<polygon points="4,35 60,35 60,12 96,50 60,88 60,65 4,65" fill="${fill}"/>`;
    case "line":
      return `<line x1="4" y1="50" x2="96" y2="50" stroke="${fill}" stroke-width="10" stroke-linecap="round"/>`;
  }
}

/** Full SVG markup for a shape at the given fill (hex like #3366ff). */
export function shapeSvg(kind: ShapeKind, fill: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${shapeBody(
    kind,
    fill
  )}</svg>`;
}

/** Inline data-URI usable directly as an <img> src / designstring `source`. */
export function shapeDataUri(kind: ShapeKind, fill: string): string {
  return "data:image/svg+xml," + encodeURIComponent(shapeSvg(kind, fill));
}

/** Sensible default box size per shape when inserted. */
export function shapeDefaultSize(kind: ShapeKind): { width: number; height: number } {
  if (kind === "line") return { width: 240, height: 40 };
  if (kind === "arrow") return { width: 220, height: 140 };
  return { width: 160, height: 160 };
}
