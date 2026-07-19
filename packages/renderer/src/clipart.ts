// Clipart SVG inlining: sanitize + recolor, faithful to the legacy Youzign
// editor (Main.ts `addClipartToStage` / `addColorsToSvg`).
//
// Legacy recolor semantics (Main.ts:848-893):
//   - Walk every <g> in the SVG.
//   - A group participates in recoloring only if its `id` contains a "Layer<n>"
//     token (id split on "_", the token containing "Layer" -> its digits).
//   - Consecutive groups sharing the same Layer index form one color band; each
//     distinct Layer index consumes the next entry from the item's `colors`
//     array (parsed from the `color` attr, "@@@"-separated signed ints -> hex).
//   - Every <path> inside a band gets `style="fill:<color>"`.
// Single-color cliparts (the triangle-cluster fixture) have one color that maps
// to the sole layer band, so all paths take colors[0].
//
// We additionally sanitize the fetched markup (remove scripts, event handlers,
// javascript: hrefs, foreignObject) since the SVG source is remote/untrusted.

import { signedIntToHex } from "@youzign/designstring";

const FILLABLE = "path,polygon,polyline,circle,rect,ellipse,line";

function sanitize(root: Element): void {
  // Drop dangerous elements.
  root.querySelectorAll("script,foreignObject,foreignobject").forEach((el) => el.remove());
  // Drop event-handler + javascript: attributes across the whole tree.
  const walk = (el: Element) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const val = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if (
        (name === "href" || name === "xlink:href") &&
        val.startsWith("javascript:")
      ) {
        el.removeAttribute(attr.name);
      }
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
}

function layerIndexOf(id: string | null): string | undefined {
  if (!id) return undefined;
  for (const token of id.split("_")) {
    if (token.includes("Layer")) return token.replace(/[^\d.-]/g, "");
  }
  return undefined;
}

/** Apply the legacy per-layer recolor to an SVG document element. */
function recolor(svgEl: Element, hexColors: string[]): void {
  if (hexColors.length === 0) return;

  const groups = Array.from(svgEl.querySelectorAll("g"));
  let lastLayer = "";
  let index = -1;
  let touchedAnyLayer = false;

  for (const g of groups) {
    const layer = layerIndexOf(g.getAttribute("id"));
    if (layer === undefined) continue;
    touchedAnyLayer = true;
    if (layer !== lastLayer) {
      lastLayer = layer;
      index++;
    }
    const color = hexColors[Math.min(index, hexColors.length - 1)];
    g.querySelectorAll("path").forEach((p) => p.setAttribute("style", `fill:${color}`));
  }

  // Fallback for SVGs without Layer-tagged groups: paint every fillable shape
  // with the first color (single-color cliparts render faithfully).
  if (!touchedAnyLayer) {
    const color = hexColors[0];
    svgEl.querySelectorAll(FILLABLE).forEach((el) => {
      el.setAttribute("style", `fill:${color}`);
      el.removeAttribute("fill");
    });
  }
}

// Every inlined clipart shares generic internal ids (the rescued legacy SVGs all
// use `id="Layer1_0_FILL"` + `<use xlink:href="#Layer1_0_FILL">`). When several
// different cliparts are inlined into the SAME document, a `<use href="#id">`
// resolves to the FIRST element with that id anywhere in the page — so every
// clipart would paint the first one's shape. Namespace all ids (and the intra-
// SVG references to them) with a per-instance prefix so each inlined SVG is
// self-contained. This is a correctness fix for ALL svg cliparts; it changes no
// visual/recolor semantics.
let svgInstanceCounter = 0;

function namespaceIds(svgEl: Element): void {
  const ids = new Set<string>();
  const collect = (el: Element) => {
    const id = el.getAttribute("id");
    if (id) ids.add(id);
    for (const child of Array.from(el.children)) collect(child);
  };
  collect(svgEl);
  if (ids.size === 0) return;

  const prefix = `yzc${svgInstanceCounter++}-`;
  const rename = (id: string) => `${prefix}${id}`;

  const rewrite = (el: Element) => {
    const id = el.getAttribute("id");
    if (id && ids.has(id)) el.setAttribute("id", rename(id));
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      let val = attr.value;
      // Reference forms: href="#id" / xlink:href="#id".
      if ((name === "href" || name === "xlink:href") && val.startsWith("#")) {
        const ref = val.slice(1);
        if (ids.has(ref)) el.setAttribute(attr.name, `#${rename(ref)}`);
        continue;
      }
      // Functional refs anywhere (fill/clip-path/mask/filter, incl. inside style).
      if (val.includes("url(")) {
        val = val.replace(/url\((['"]?)#([^)'"]+)\1\)/g, (m, q: string, ref: string) =>
          ids.has(ref) ? `url(${q}#${rename(ref)}${q})` : m
        );
        if (val !== attr.value) el.setAttribute(attr.name, val);
      }
    }
    for (const child of Array.from(el.children)) rewrite(child);
  };
  rewrite(svgEl);
}

export interface InlinedSvg {
  markup: string;
}

/**
 * Parse, sanitize and recolor a raw SVG string. Returns serialized SVG markup
 * (with width/height forced to the item box) or null if it isn't valid SVG.
 */
export function inlineClipartSvg(
  svgText: string,
  colorInts: number[],
  width: number,
  height: number
): InlinedSvg | null {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svgEl = doc.documentElement;
  if (!svgEl || svgEl.nodeName.toLowerCase() !== "svg") return null;
  if (doc.getElementsByTagName("parsererror").length > 0) return null;

  sanitize(svgEl);
  recolor(svgEl, colorInts.map(signedIntToHex));
  namespaceIds(svgEl);

  svgEl.setAttribute("width", String(width));
  svgEl.setAttribute("height", String(height));
  svgEl.setAttribute("preserveAspectRatio", "none");

  return { markup: new XMLSerializer().serializeToString(svgEl) };
}

/**
 * True when a clipart source points at an SVG we can inline + recolor.
 *
 * Covers both a plain `.svg` URL (desktop app, live backend) AND an
 * `data:image/svg+xml` data URL. The legacy-import flow inlines every fetched
 * asset — including the clipart SVG — as a base64 data URL, so by the time the
 * renderer sees it the `.svg` extension is gone. Without matching the data-URL
 * form, inlined cliparts fell through to the raw <img> path and rendered in the
 * SVG's default fill instead of the item's stored color(s).
 */
export function isSvgSource(url: string): boolean {
  return /^data:image\/svg\+xml/i.test(url) || /\.svg(\?|#|$)/i.test(url);
}
