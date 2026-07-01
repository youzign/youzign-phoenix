import type { CSSProperties } from "react";
import type { Design } from "@youzign/designstring";
import { backgroundCss } from "./background.js";
import { ItemView } from "./items.js";

export interface DesignCanvasProps {
  design: Design;
  zoom?: number;
}

/**
 * Renders a designstring canvas. Items keep their absolute px coordinates;
 * the whole canvas is scaled via CSS transform on an outer wrapper.
 */
export function DesignCanvas({ design, zoom = 1 }: DesignCanvasProps) {
  const items = [...design.items].sort(
    (a, b) => ((a as any).index ?? 0) - ((b as any).index ?? 0)
  );

  const canvasStyle: CSSProperties = {
    position: "relative",
    width: design.canvasWidth,
    height: design.canvasHeight,
    overflow: "hidden",
    ...backgroundCss(design),
    border: design.borderWidth > 0 ? `${design.borderWidth}px solid ${"#000"}` : undefined,
  };

  const wrapperStyle: CSSProperties = {
    width: design.canvasWidth * zoom,
    height: design.canvasHeight * zoom,
  };
  const scaleStyle: CSSProperties = {
    transform: `scale(${zoom})`,
    transformOrigin: "top left",
  };

  return (
    <div style={wrapperStyle}>
      <div style={scaleStyle}>
        <div className="yz-canvas" style={canvasStyle}>
          {items.map((item, i) => (
            <ItemView key={i} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
