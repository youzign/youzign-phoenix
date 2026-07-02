import type { CSSProperties } from "react";
import { signedIntToHex, type Design, type FilterItem } from "@youzign/designstring";
import { backgroundCss } from "./background.js";
import { ItemView } from "./items.js";
import { filterRecipe, VIGNETTE_BACKGROUND } from "./filters.js";

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

  // Legacy canvas filter (PanelFilters.ts): at most one <item type="filter">.
  const filterItem = design.items.find((it) => it.type === "filter") as
    | FilterItem
    | undefined;
  const recipe =
    filterItem && filterItem.filterid > 1
      ? filterRecipe(filterItem.filterid, filterItem.opacity)
      : undefined;

  const canvasStyle: CSSProperties = {
    position: "relative",
    width: design.canvasWidth,
    height: design.canvasHeight,
    overflow: "hidden",
    ...backgroundCss(design),
    filter: recipe?.canvasFilter,
    border:
      design.borderWidth > 0
        ? `${design.borderWidth}px solid ${signedIntToHex(design.borderColor)}`
        : undefined,
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
          {recipe?.layers.map((layer, i) => (
            <div
              key={`filterLayer${i}`}
              className="yz-filter-layer"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 9999,
                pointerEvents: "none",
                backgroundImage: VIGNETTE_BACKGROUND,
                backgroundRepeat: "no-repeat",
                backgroundSize: "100% 100%",
                mixBlendMode: layer.blendMode as CSSProperties["mixBlendMode"],
                opacity: layer.opacity,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
