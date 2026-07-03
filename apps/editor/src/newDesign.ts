import { parse } from "@youzign/designstring";
import { createImageItem } from "@youzign/editor-core";
import type { EditorDocument } from "./document.js";

export const START_IMAGE_MAX_DIM = 6000;

export function startImageDims(
  width: number,
  height: number,
  cap = START_IMAGE_MAX_DIM
): { width: number; height: number; scale: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (longest <= cap || longest === 0) return { width, height, scale: 1, scaled: false };
  const scale = cap / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
    scaled: true,
  };
}

export function blankDocument(width: number, height: number): EditorDocument {
  return {
    pages: [
      {
        design: parse(
          `<data canvas_width="${Math.round(width)}" canvas_height="${Math.round(height)}" bg_color="-1" bg_type="color"></data>`
        ),
      },
    ],
    activePage: 0,
  };
}

export function imageDocument(source: string, width: number, height: number): EditorDocument {
  const doc = blankDocument(width, height);
  const design = doc.pages[0].design;
  const item = createImageItem(design, source, width / 2, height / 2, { width, height });
  design.items.push(item);
  return doc;
}
