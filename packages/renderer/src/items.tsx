import { useState } from "react";
import type { CSSProperties } from "react";
import {
  signedIntToHex,
  type ClipartItem,
  type GroupItem,
  type ImageItem,
  type Item,
  type TextItem,
} from "@youzign/designstring";
import { boxTopLeft, flipTransform, matrixToCss, textPlacement } from "./geometry.js";

/** Render an item by type. */
export function ItemView({ item }: { item: Item }) {
  switch (item.type) {
    case "image":
      return <ImageItemView item={item} />;
    case "text":
    case "text-curved":
      return <TextItemView item={item as TextItem} />;
    case "clipart":
      return <ClipartItemView item={item} />;
    case "group":
      return <GroupItemView item={item} />;
    case "filter":
      return null; // no-op overlay (pending)
    default:
      return null;
  }
}

function ImageItemView({ item }: { item: ImageItem }) {
  const [errored, setErrored] = useState(false);
  const { left, top } = boxTopLeft(item);
  const style: CSSProperties = {
    position: "absolute",
    left,
    top,
    width: item.width,
    height: item.height,
    opacity: item.opacity,
    transformOrigin: "center center",
    transform: `rotate(${item.rotation}deg) ${flipTransform(item.hFlip, item.vFlip)}`.trim(),
  };

  if (errored) {
    return (
      <div
        style={{
          ...style,
          border: "2px dashed #b45",
          background: "repeating-linear-gradient(45deg,#2a2a2a,#2a2a2a 10px,#242424 10px,#242424 20px)",
          color: "#c88",
          fontSize: 12,
          fontFamily: "monospace",
          padding: 6,
          overflow: "hidden",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          wordBreak: "break-all",
        }}
        title={item.source}
      >
        {`image 404 · ${item.width}×${item.height}`}
        <br />
        {item.source}
      </div>
    );
  }

  return (
    <img
      src={item.source}
      alt=""
      onError={() => setErrored(true)}
      style={{ ...style, objectFit: "fill" }}
    />
  );
}

interface Run {
  text: string;
  color: string;
}

/** Split content into runs merging consecutive glyphs of the same color. */
function buildRuns(content: string, colors: number[]): Run[] {
  const chars = Array.from(content);
  if (colors.length === 0) return [{ text: content, color: "#000000" }];
  const runs: Run[] = [];
  for (let i = 0; i < chars.length; i++) {
    const colorInt = colors[Math.min(i, colors.length - 1)];
    const color = signedIntToHex(colorInt);
    const last = runs[runs.length - 1];
    if (last && last.color === color) last.text += chars[i];
    else runs.push({ text: chars[i], color });
  }
  return runs;
}

function TextItemView({ item }: { item: TextItem }) {
  const { left, top, matrix } = textPlacement(item);
  const runs = buildRuns(item.content, item.colors);

  const style: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: item.textAreaWidth,
    height: item.textAreaHeight,
    fontSize: item.size,
    lineHeight: `${item.textAreaHeight}px`, // vertically center single line
    fontFamily: `"${item.font}", sans-serif`,
    fontWeight: item.bold ? 700 : 400,
    fontStyle: item.italic ? "italic" : "normal",
    textDecoration: [item.underline ? "underline" : "", item.strikethrough ? "line-through" : ""]
      .filter(Boolean)
      .join(" ") || "none",
    textAlign: (item.alignment as CSSProperties["textAlign"]) || "left",
    whiteSpace: "pre",
    opacity: item.opacity,
    transform: matrixToCss(matrix),
    transformOrigin: "0 0",
    overflow: "visible",
  };

  return (
    <div style={style}>
      {runs.map((r, i) => (
        <span key={i} style={{ color: r.color }}>
          {r.text}
        </span>
      ))}
    </div>
  );
}

function ClipartItemView({ item }: { item: ClipartItem }) {
  const { left, top } = boxTopLeft(item);
  const fill = item.colors.length ? signedIntToHex(item.colors[0]) : "#888888";
  // SWF/SVG shape rendering is pending: draw a bounded placeholder box.
  return (
    <div
      title={`clipart (pending shape) · ${item.source || item.sourceSvg}`}
      style={{
        position: "absolute",
        left,
        top,
        width: item.width,
        height: item.height,
        background: fill,
        opacity: item.opacity,
        transformOrigin: "center center",
        transform: `rotate(${item.rotation}deg) ${flipTransform(item.hFlip, item.vFlip)}`.trim(),
      }}
    />
  );
}

function GroupItemView({ item }: { item: GroupItem }) {
  // Legacy: group box top-left = (xpos - w/2, ypos - h/2); children xpos/ypos are
  // group-center-relative. We place a wrapper at the group CENTER so a child at
  // local (0,0) lands at the group center, matching parseGroupItem's offset.
  const style: CSSProperties = {
    position: "absolute",
    left: item.xpos,
    top: item.ypos,
    width: 0,
    height: 0,
    opacity: item.opacity,
    transformOrigin: "0 0",
    transform: `rotate(${item.rotation}deg) scale(${item.scaleX}, ${item.scaleY}) ${flipTransform(
      item.hFlip,
      item.vFlip
    )}`.trim(),
  };
  const children = [...item.items].sort((a, b) => (a as any).index - (b as any).index);
  return (
    <div style={style}>
      {children.map((c, i) => (
        <ItemView key={i} item={c} />
      ))}
    </div>
  );
}
