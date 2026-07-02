// Selection-box geometry: a center-based, rotated box per item, used by the
// editor overlay for handles and hit-testing. Coordinates are in canvas space.

import type { Item } from "@youzign/designstring";

export interface SelBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

export function itemBox(item: Item & Record<string, any>): SelBox {
  switch (item.type) {
    case "image":
    case "clipart":
      return { cx: item.xpos, cy: item.ypos, w: item.width, h: item.height, rotation: item.rotation };
    case "group":
      return {
        cx: item.xpos,
        cy: item.ypos,
        w: item.width || 140,
        h: item.height || 140,
        rotation: item.rotation,
      };
    case "text":
    case "text-curved": {
      const sx = item.textAreaWidth ? item.mcWidth / item.textAreaWidth : 1;
      const sy = item.textAreaHeight ? item.mcHeight / item.textAreaHeight : 1;
      const left = item.xpos + item.textAreaxpos * sx;
      const top = item.ypos + item.textAreaypos * sy;
      const w = item.mcWidth || item.textAreaWidth * sx;
      const h = item.mcHeight || item.textAreaHeight * sy;
      return { cx: left + w / 2, cy: top + h / 2, w, h, rotation: item.rotation };
    }
    default:
      return { cx: 0, cy: 0, w: 0, h: 0, rotation: 0 };
  }
}
