import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  signedIntToHex,
  type ClipartItem,
  type GroupItem,
  type ImageItem,
  type Item,
  type TextItem,
  type TextCurvedItem,
} from "@youzign/designstring";
import {
  boxTopLeft,
  flipTransform,
  matrixToCss,
  textPlacement,
  curvedTextArc,
} from "./geometry.js";
import { inlineClipartSvg, isSvgSource } from "./clipart.js";
import { effectFilter, textBorderShadow, blendModeCss, cornerRadiusCss } from "./effects.js";

/** Render an item by type. */
export function ItemView({ item }: { item: Item }) {
  switch (item.type) {
    case "image":
      return <ImageItemView item={item} />;
    case "text":
      return <TextItemView item={item as TextItem} />;
    case "text-curved":
      return <TextCurvedItemView item={item as TextCurvedItem} />;
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
  // Retry when the source changes (a reused keyed <img> that errored on a prior
  // src must not stay broken forever, e.g. when swapping designs/fixtures).
  useEffect(() => {
    setErrored(false);
  }, [item.source]);
  const { left, top } = boxTopLeft(item);
  const style: CSSProperties = {
    position: "absolute",
    left,
    top,
    width: item.width,
    height: item.height,
    opacity: item.opacity,
    filter: effectFilter(item),
    mixBlendMode: blendModeCss(item) as CSSProperties["mixBlendMode"],
    borderRadius: cornerRadiusCss(item),
    transformOrigin: "center center",
    transform: `rotate(${item.rotation}deg) ${flipTransform(item.hFlip, item.vFlip)}`.trim(),
  };

  if (errored) {
    return (
      <div
        style={{
          ...style,
          borderRadius: Math.min(12, item.width * 0.06, item.height * 0.06),
          border: "1px solid rgba(0,0,0,0.08)",
          background:
            "repeating-linear-gradient(45deg,#eceef2,#eceef2 9px,#e3e6ec 9px,#e3e6ec 18px)",
          color: "#8b93a1",
          overflow: "hidden",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 12,
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
        title={item.source}
      >
        <svg
          width={Math.max(20, Math.min(40, item.width * 0.22))}
          height={Math.max(20, Math.min(40, item.width * 0.22))}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15V5a2 2 0 0 0-2-2H9M3 3l18 18" />
          <path d="M3 7v12a2 2 0 0 0 2 2h12M8.5 10.5 3 17" />
        </svg>
        {Math.min(item.width, item.height) > 90 && (
          <span
            style={{
              fontSize: 12,
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              fontWeight: 500,
            }}
          >
            Image unavailable
          </span>
        )}
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
    filter: effectFilter(item),
    mixBlendMode: blendModeCss(item) as CSSProperties["mixBlendMode"],
    textShadow: textBorderShadow(item),
    transform: matrixToCss(matrix),
    transformOrigin: "0 0",
    overflow: "visible",
  };

  // Legacy: with a border of size > 1 and "no fill", the glyph fill goes
  // transparent so only the outline (textShadow) shows.
  const noFill = item.isNoFill && item.isBorder && item.borderSize > 1;

  return (
    <div style={style}>
      {runs.map((r, i) => (
        <span key={i} style={{ color: noFill ? "transparent" : r.color }}>
          {r.text}
        </span>
      ))}
    </div>
  );
}

let curvedSeq = 0;

function TextCurvedItemView({ item }: { item: TextCurvedItem }) {
  const arc = curvedTextArc(
    item.radius,
    item.startAngle,
    item.endAngle,
    item.topDirection
  );

  // Not actually curved (radius 0 / zero span): fall back to straight text so a
  // freshly-created or de-curved item still renders sensibly.
  if (!arc.curved) return <TextItemView item={item as unknown as TextItem} />;

  const [pathId] = useState(() => `yz-curve-${item.index}-${curvedSeq++}`);
  const color = signedIntToHex(item.colors.length ? item.colors[0] : 0);

  // Legacy places curved text via createGroupMatrix: (xpos,ypos) is the origin
  // and rotation pivots there. We align the arc apex (text centre) to that
  // origin and rotate about it.
  const style: CSSProperties = {
    position: "absolute",
    left: item.xpos - arc.apexX,
    top: item.ypos - arc.apexY,
    width: arc.width,
    height: arc.height,
    overflow: "visible",
    opacity: item.opacity,
    filter: effectFilter(item),
    mixBlendMode: blendModeCss(item) as CSSProperties["mixBlendMode"],
    transformOrigin: `${arc.apexX}px ${arc.apexY}px`,
    transform: `rotate(${item.rotation}deg) ${flipTransform(item.hFlip, item.vFlip)}`.trim(),
  };

  return (
    <svg style={style} width={arc.width} height={arc.height} viewBox={`0 0 ${arc.width} ${arc.height}`}>
      <defs>
        <path id={pathId} d={arc.path} fill="none" />
      </defs>
      <text
        style={{
          fontSize: item.size,
          fontFamily: `"${item.font}", sans-serif`,
          fontWeight: item.bold ? 700 : 400,
          fontStyle: item.italic ? "italic" : "normal",
          fill: color,
        }}
      >
        <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
          {item.content}
        </textPath>
      </text>
    </svg>
  );
}

function ClipartItemView({ item }: { item: ClipartItem }) {
  const { left, top } = boxTopLeft(item);
  const url = item.sourceSvg || item.source;
  const svgIsSource = isSvgSource(url);

  const [markup, setMarkup] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!svgIsSource || !url) return;
    let cancelled = false;
    setMarkup(null);
    setErrored(false);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        const inlined = inlineClipartSvg(text, item.colors, item.width, item.height);
        if (inlined) setMarkup(inlined.markup);
        else setErrored(true);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, svgIsSource, item.width, item.height, item.colors.join(",")]);

  const boxStyle: CSSProperties = {
    position: "absolute",
    left,
    top,
    width: item.width,
    height: item.height,
    opacity: item.opacity,
    filter: effectFilter(item),
    mixBlendMode: blendModeCss(item) as CSSProperties["mixBlendMode"],
    transformOrigin: "center center",
    transform: `rotate(${item.rotation}deg) ${flipTransform(item.hFlip, item.vFlip)}`.trim(),
  };

  // Non-SVG clipart (PNG source) reuses the standard image render path.
  if (!svgIsSource) {
    return (
      <ImageItemView
        item={{ ...(item as unknown as ImageItem), type: "image", source: url }}
      />
    );
  }

  // SVG fetched + recolored + inlined.
  if (markup) {
    return (
      <div style={boxStyle} dangerouslySetInnerHTML={{ __html: markup }} />
    );
  }

  // 404 / parse failure: graceful bounded placeholder (colored by first fill).
  if (errored) {
    const fill = item.colors.length ? signedIntToHex(item.colors[0]) : "#888888";
    return (
      <div
        title={`clipart 404 · ${url}`}
        style={{
          ...boxStyle,
          background: fill,
          border: "2px dashed rgba(255,255,255,0.35)",
          boxSizing: "border-box",
        }}
      />
    );
  }

  // Loading.
  return <div style={boxStyle} />;
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
    filter: effectFilter(item),
    mixBlendMode: blendModeCss(item) as CSSProperties["mixBlendMode"],
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
